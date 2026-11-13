import { createFileRoute } from "@tanstack/react-router";

/**
 * Daily noon briefing. Called by pg_cron (see docs/daily-briefing.md):
 *  - { action: "snapshot", hour: 11 } at 11:30 Brussels: stores today's snapshot (the film is rendered from it).
 *  - { action: "mail", hour: 12 } at 12:00 Brussels: emails the briefing with a link to /briefing.
 * `hour` makes the job a no-op outside that Brussels hour (the cron runs at two UTC times to follow DST).
 * Requires `Authorization: Bearer <service role key or MONITOR_CRON_SECRET>`.
 */
function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

export const Route = createFileRoute("/api/public/hooks/daily-briefing")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const allowed = [process.env.MONITOR_CRON_SECRET, process.env.SUPABASE_SERVICE_ROLE_KEY].filter(
          (v): v is string => !!v && v.length >= 24,
        );
        if (!allowed.length) return new Response("not configured", { status: 503 });
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        if (!allowed.some((k) => safeEqual(token, k))) return new Response("unauthorized", { status: 401 });

        let body: { action?: string; hour?: number; force?: boolean } = {};
        try {
          body = await request.json();
        } catch {
          /* empty */
        }
        const { brusselsHour, briefingStatus, briefingMail } = await import("@/lib/briefing");
        if (typeof body.hour === "number" && !body.force && brusselsHour() !== body.hour) {
          return Response.json({ ok: true, skipped: "not this hour" });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db = supabaseAdmin as any;

        if (body.action === "snapshot") {
          const { data: snap, error } = await db.rpc("briefing_snapshot");
          if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
          const status = briefingStatus(snap);
          const { error: e2 } = await db
            .from("daily_briefings")
            .upsert({ day: snap.day, status, snapshot: snap, created_at: new Date().toISOString() }, { onConflict: "day" });
          if (e2) return Response.json({ ok: false, error: e2.message }, { status: 500 });
          return Response.json({ ok: true, day: snap.day, status });
        }

        if (body.action === "mail") {
          const key = process.env.RESEND_API_KEY;
          if (!key) return Response.json({ ok: false, error: "RESEND_API_KEY missing" }, { status: 503 });
          const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());
          const { data: row } = await db.from("daily_briefings").select("*").eq("day", day).maybeSingle();
          if (!row) return Response.json({ ok: false, error: "no snapshot for today" }, { status: 404 });
          if (row.emailed_at && !body.force) return Response.json({ ok: true, skipped: "already emailed" });
          const base = (process.env.HUB_PUBLIC_URL || "https://solyn22.lovable.app").replace(/\/$/, "");
          const m = briefingMail(row.snapshot, `${base}/briefing?day=${day}`, !!row.video_path);
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
            body: JSON.stringify({
              from: process.env.ALERT_EMAIL_FROM || "Solyn Status <status@solynglobal.be>",
              to: [process.env.ALERT_EMAIL_TO || "jason@solynglobal.be"],
              subject: m.subject,
              html: m.html,
              text: m.text,
            }),
          });
          if (!res.ok) return Response.json({ ok: false, error: `Resend ${res.status}` }, { status: 502 });
          await db.from("daily_briefings").update({ emailed_at: new Date().toISOString() }).eq("day", day);
          return Response.json({ ok: true, emailed: day, status: m.status });
        }
        return Response.json({ ok: false, error: "unknown action" }, { status: 400 });
      },
    },
  },
});
