import { createFileRoute } from "@tanstack/react-router";
import { RULES, checkBooking, freeSlots, whenLabel, type Busy } from "@/lib/booking";

/**
 * The public booking page talks to this. GET lists the free hours; POST books one.
 * Visitors only ever see free start times: never what the owner is busy with, and no other client's data.
 */
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function busyTimes(db: any, now: Date): Promise<Busy[]> {
  const from = now.toISOString(), to = new Date(now.getTime() + (RULES.horizonDays + 2) * 864e5).toISOString();
  const [cal, booked] = await Promise.all([
    db.from("calendar_busy").select("starts_at, ends_at").lt("starts_at", to).gt("ends_at", from).limit(2000),
    db.from("bookings").select("starts_at, ends_at").eq("status", "confirmed").gt("ends_at", from).limit(500),
  ]);
  if (cal.error || booked.error) throw new Error((cal.error ?? booked.error).message);
  return [...(cal.data ?? []), ...(booked.data ?? [])].map((r: { starts_at: string; ends_at: string }) => ({ start: r.starts_at, end: r.ends_at }));
}
async function mail(to: string, subject: string, html: string, text: string, replyTo?: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ from: process.env.BOOKING_EMAIL_FROM || "Solyn Global <status@solynglobal.be>", to: [to], subject, html, text, ...(replyTo ? { reply_to: replyTo } : {}) }),
  });
  return res.ok;
}

export const Route = createFileRoute("/api/public/booking")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const now = new Date();
          return json({ slots: freeSlots(now, await busyTimes(supabaseAdmin, now)), minutes: RULES.minutes });
        } catch (e) {
          console.error("[booking] slots failed", e instanceof Error ? e.message : e);
          return json({ error: "De agenda is even niet bereikbaar." }, 500);
        }
      },
      POST: async ({ request }) => {
        let raw: Record<string, unknown>;
        try { raw = (await request.json()) as Record<string, unknown>; } catch { return json({ error: "Ongeldige aanvraag." }, 400); }
        if (raw.website) return json({ ok: true });   // a field people never see: only robots fill it in
        const checked = checkBooking(raw);
        if (!checked.ok) return json({ error: checked.error }, 400);
        const b = checked.value;
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const db = supabaseAdmin as any, now = new Date();
          const start = new Date(b.start).toISOString();
          if (!freeSlots(now, await busyTimes(db, now)).includes(start)) return json({ error: "Dat uur is net bezet. Kies een ander moment." }, 409);
          const { count } = await db.from("bookings").select("id", { count: "exact", head: true }).eq("email", b.email).eq("status", "confirmed").gt("starts_at", now.toISOString());
          if ((count ?? 0) >= 3) return json({ error: "Je hebt al drie afspraken openstaan. Mail ons om er nog een te plannen." }, 429);
          const end = new Date(Date.parse(start) + RULES.minutes * 6e4).toISOString();
          const { error } = await db.from("bookings").insert({ name: b.name, email: b.email, phone: b.phone || null, company: b.company || null, note: b.note || null, starts_at: start, ends_at: end });
          if (error) return json({ error: error.code === "23505" ? "Dat uur is net bezet. Kies een ander moment." : "Boeken lukte niet. Probeer het opnieuw." }, error.code === "23505" ? 409 : 500);

          const when = whenLabel(start), owner = process.env.ALERT_EMAIL_TO || "jason@solynglobal.be";
          const box = (inner: string) => `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#1B222C">${inner}</div>`;
          await Promise.all([
            mail(b.email, `Je afspraak met Solyn Global: ${when}`,
              box(`<h2 style="margin:0 0 12px">Je afspraak staat vast</h2><p>Dag ${esc(b.name)},</p><p>We spreken elkaar op <strong>${esc(when)}</strong>, voor een uur. Je krijgt nog een uitnodiging voor je agenda.</p><p>Past het toch niet? Antwoord op deze mail, dan zoeken we een ander moment.</p><p>Jason Balongo<br>Solyn Global</p>`),
              `Dag ${b.name},\n\nJe afspraak met Solyn Global staat vast: ${when}, voor een uur.\nPast het toch niet? Antwoord op deze mail.\n\nJason Balongo\nSolyn Global`, owner),
            mail(owner, `Nieuwe afspraak: ${b.name}, ${when}`,
              box(`<h2 style="margin:0 0 12px">Nieuwe afspraak geboekt</h2><p><strong>${esc(when)}</strong> (1 uur)</p><p>${esc(b.name)}${b.company ? `, ${esc(b.company)}` : ""}<br>${esc(b.email)}${b.phone ? `<br>${esc(b.phone)}` : ""}</p>${b.note ? `<p style="padding:10px 12px;border-radius:8px;background:#f5f5f3">${esc(b.note)}</p>` : ""}<p style="color:#6b6b6b;font-size:13px">De afspraak komt binnen het uur in je Google Agenda.</p>`),
              `Nieuwe afspraak: ${when}\n${b.name}${b.company ? `, ${b.company}` : ""}\n${b.email}${b.phone ? `\n${b.phone}` : ""}${b.note ? `\n\n${b.note}` : ""}`, b.email),
          ]);
          return json({ ok: true, when });
        } catch (e) {
          console.error("[booking] failed", e instanceof Error ? e.message : e);
          return json({ error: "Boeken lukte niet. Probeer het opnieuw." }, 500);
        }
      },
    },
  },
});
