import { createFileRoute } from "@tanstack/react-router";

/**
 * Scheduled monitoring run. Called by pg_cron (see docs/status-hub.md) every 5 min;
 * each site is only checked when its own interval has passed.
 * Requires `Authorization: Bearer <MONITOR_CRON_SECRET or service role key>`.
 */
function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

export const Route = createFileRoute("/api/public/hooks/monitor-run")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Accept the dedicated secret (if set) or the service role key, which the
        // pg_cron job reads from Vault (same as the invoice jobs).
        const allowed = [process.env.MONITOR_CRON_SECRET, process.env.SUPABASE_SERVICE_ROLE_KEY].filter(
          (v): v is string => !!v && v.length >= 24,
        );
        if (!allowed.length) return new Response("not configured", { status: 503 });
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        if (!allowed.some((k) => safeEqual(token, k))) return new Response("unauthorized", { status: 401 });

        const { runMonitoring } = await import("@/lib/monitoring/run.server");
        try {
          const summary = await runMonitoring();
          return Response.json({ ok: true, ...summary });
        } catch (e) {
          console.error("monitor-run failed", e);
          return Response.json({ ok: false, error: "run failed" }, { status: 500 });
        }
      },
    },
  },
});
