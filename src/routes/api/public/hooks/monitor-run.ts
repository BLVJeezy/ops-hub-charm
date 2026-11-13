import { createFileRoute } from "@tanstack/react-router";

/**
 * Scheduled monitoring run. Called by pg_cron (see docs/status-hub.md) every 5 min;
 * each site is only checked when its own interval has passed.
 * Requires `Authorization: Bearer <MONITOR_CRON_SECRET>`.
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
        const secret = process.env.MONITOR_CRON_SECRET;
        if (!secret || secret.length < 24) return new Response("not configured", { status: 503 });
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        if (!safeEqual(token, secret)) return new Response("unauthorized", { status: 401 });

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
