import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Input = {
  id: string;
  action: "move" | "cancel" | "restore";
  start?: string;
  end?: string;
  mail: boolean;
};

/**
 * Moving, cancelling or restoring a booked appointment. Staff only. Checks that the new slot is free
 * (no other booking overlaps) and, when asked, mails the client the new time or the cancellation.
 */
export const changeBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: Input) => {
    if (!i?.id || !/^[0-9a-f-]{36}$/.test(i.id)) throw new Error("Onbekende afspraak");
    if (!["move", "cancel", "restore"].includes(i.action)) throw new Error("Onbekende stap");
    if (i.action === "move") {
      const s = Date.parse(i.start ?? ""),
        e = Date.parse(i.end ?? "");
      if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s || e - s > 12 * 36e5)
        throw new Error("Dat tijdstip klopt niet");
    }
    return {
      id: i.id,
      action: i.action,
      start: i.start ?? null,
      end: i.end ?? null,
      mail: !!i.mail,
    };
  })
  .handler(async ({ data, context }) => {
    const { data: staff, error: roleError } = await context.supabase.rpc("is_staff", {
      _user_id: context.userId,
    });
    if (roleError) throw new Error(roleError.message);
    if (!staff) throw new Error("Alleen voor het team");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { whenLabel } = await import("./booking");
    const { changeMail } = await import("./booking-mail");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;
    const { data: b, error } = await db
      .from("bookings")
      .select("id, name, email, starts_at, ends_at, mode, location, status, moved_from")
      .eq("id", data.id)
      .single();
    if (error || !b) throw new Error("Afspraak niet gevonden");

    let change: Record<string, string | null>;
    if (data.action === "move") {
      const { data: clash } = await db
        .from("bookings")
        .select("id")
        .eq("status", "confirmed")
        .neq("id", b.id)
        .lt("starts_at", data.end)
        .gt("ends_at", data.start)
        .limit(1);
      if (clash?.length) throw new Error("Er staat al een andere afspraak op dat moment");
      change = {
        starts_at: data.start,
        ends_at: data.end,
        moved_from: b.moved_from ?? b.starts_at,
        gcal_sent_at: null,
        status: "confirmed",
      };
    } else if (data.action === "cancel") change = { status: "cancelled" };
    else change = { status: "confirmed" };
    const up = await db.from("bookings").update(change).eq("id", b.id);
    if (up.error)
      throw new Error(
        up.error.code === "23505" ? "Er staat al een afspraak op dat uur" : up.error.message,
      );

    if (!data.mail || data.action === "restore")
      return {
        ok: true,
        change,
        mailed: false,
        reason: data.mail ? "niet voor herstellen" : "niet gevraagd",
      };
    if (!b.email || !process.env.RESEND_API_KEY)
      return { ok: true, change, mailed: false, reason: "geen mail mogelijk" };
    const who = {
      name: b.name,
      mode: b.mode === "onsite" ? ("onsite" as const) : ("online" as const),
      location: b.location ?? "",
    };
    const m =
      data.action === "move"
        ? changeMail(who, {
            kind: "moved",
            from: whenLabel(b.starts_at),
            to: whenLabel(data.start!),
          })
        : changeMail(who, { kind: "cancelled", when: whenLabel(b.starts_at) });
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: process.env.BOOKING_EMAIL_FROM || "Solyn Global <status@solynglobal.be>",
        to: [b.email],
        reply_to: process.env.ALERT_EMAIL_TO || "jason@solynglobal.be",
        subject: m.subject,
        html: m.html,
        text: m.text,
      }),
    });
    return { ok: true, change, mailed: res.ok, reason: res.ok ? undefined : "versturen mislukte" };
  });
