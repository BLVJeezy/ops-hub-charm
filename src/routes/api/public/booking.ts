import { createFileRoute } from "@tanstack/react-router";
import { clientMail, ownerMail } from "@/lib/booking-mail";
import { RULES, checkBooking, checkFiles, freeSlots, safeName, whenLabel, type Busy } from "@/lib/booking";

/**
 * The public booking page talks to this. GET lists the free hours; POST books one.
 * Visitors only ever see free start times: never what the owner is busy with, and no other client's data.
 */
// The booking page also lives on the company website, so that site may call this from the browser.
const SITES = ["https://solynglobal.be", "https://www.solynglobal.be"];
const cors = (request: Request): Record<string, string> => {
  const origin = request.headers.get("origin") ?? "";
  return SITES.includes(origin) ? { "access-control-allow-origin": origin, "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type", "access-control-max-age": "86400", vary: "Origin" } : {};
};
const json = (body: unknown, status: number, extra: Record<string, string>) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...extra } });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function busyTimes(db: any, now: Date): Promise<Busy[]> {
  const from = now.toISOString(), to = new Date(now.getTime() + (RULES.horizonDays + 2) * 864e5).toISOString();
  const [cal, booked] = await Promise.all([
    // work blocks give way to a meeting, so they do not make an hour busy
    db.from("calendar_busy").select("starts_at, ends_at").neq("kind", "block").lt("starts_at", to).gt("ends_at", from).limit(2000),
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
      OPTIONS: async ({ request }) => new Response(null, { status: 204, headers: cors(request) }),
      GET: async ({ request }) => {
        const reply = (b: unknown, status = 200) => json(b, status, cors(request));
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const now = new Date();
          return reply({ slots: freeSlots(now, await busyTimes(supabaseAdmin, now)), minutes: RULES.minutes });
        } catch (e) {
          console.error("[booking] slots failed", e instanceof Error ? e.message : e);
          return reply({ error: "De agenda is even niet bereikbaar." }, 500);
        }
      },
      POST: async ({ request }) => {
        const reply = (b: unknown, status = 200) => json(b, status, cors(request));
        // the page sends a form with the fields and any files; plain JSON (no files) works too
        let raw: Record<string, unknown>, files: File[] = [];
        try {
          if ((request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
            const form = await request.formData();
            raw = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string"));
            files = form.getAll("files").filter((v): v is File => typeof v !== "string" && v.size > 0);
          } else raw = (await request.json()) as Record<string, unknown>;
        } catch { return reply({ error: "Ongeldige aanvraag." }, 400); }
        if (raw.website) return reply({ ok: true });   // a field people never see: only robots fill it in
        const checked = checkBooking(raw);
        if (!checked.ok) return reply({ error: checked.error }, 400);
        const b = checked.value;
        const fileError = checkFiles(files.map((f) => ({ name: f.name, size: f.size, type: f.type })));
        if (fileError) return reply({ error: fileError }, 400);
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const db = supabaseAdmin as any, now = new Date();
          const start = new Date(b.start).toISOString();
          if (!freeSlots(now, await busyTimes(db, now)).includes(start)) return reply({ error: "Dat uur is net bezet. Kies een ander moment." }, 409);
          const { count } = await db.from("bookings").select("id", { count: "exact", head: true }).eq("email", b.email).eq("status", "confirmed").gt("starts_at", now.toISOString());
          if ((count ?? 0) >= 3) return reply({ error: "Je hebt al drie afspraken openstaan. Mail ons om er nog een te plannen." }, 429);
          const end = new Date(Date.parse(start) + RULES.minutes * 6e4).toISOString();
          const { data: row, error } = await db.from("bookings").insert({ name: b.name, email: b.email, phone: b.phone || null, company: b.company || null, note: b.note || null, starts_at: start, ends_at: end, mode: b.mode, location: b.location || null, topics: b.topics }).select("id").single();
          if (error) return reply({ error: error.code === "23505" ? "Dat uur is net bezet. Kies een ander moment." : "Boeken lukte niet. Probeer het opnieuw." }, error.code === "23505" ? 409 : 500);

          // the booking stands even when a file fails to store: the owner is told how many arrived
          const stored: { name: string; path: string; size: number; type: string }[] = [];
          for (const [i, f] of files.entries()) {
            const path = `${row.id}/${i + 1}-${safeName(f.name)}`;
            const up = await supabaseAdmin.storage.from("booking-files").upload(path, f, { contentType: f.type, upsert: false });
            if (up.error) console.error("[booking] file not stored", up.error.message); else stored.push({ name: f.name.slice(0, 120), path, size: f.size, type: f.type });
          }
          if (stored.length) await db.from("bookings").update({ attachments: stored }).eq("id", row.id);
          const when = whenLabel(start), owner = process.env.ALERT_EMAIL_TO || "jason@solynglobal.be";
          const hub = process.env.HUB_PUBLIC_URL ? `${process.env.HUB_PUBLIC_URL.replace(/\/$/, "")}/agenda` : "https://solyn22.lovable.app/agenda";
          const details = { ...b, when, files: { sent: files.length, stored: stored.length } };
          const toClient = clientMail(details, owner), toOwner = ownerMail(details, hub);
          await Promise.all([
            mail(b.email, toClient.subject, toClient.html, toClient.text, owner),
            mail(owner, toOwner.subject, toOwner.html, toOwner.text, b.email),
          ]);
          return reply({ ok: true, when });
        } catch (e) {
          console.error("[booking] failed", e instanceof Error ? e.message : e);
          return reply({ error: "Boeken lukte niet. Probeer het opnieuw." }, 500);
        }
      },
    },
  },
});
