import { createFileRoute } from "@tanstack/react-router";

/**
 * Copies Vercel Web Analytics into the Hub. Called daily by pg_cron, or by hand.
 * Requires `Authorization: Bearer <service role key or MONITOR_CRON_SECRET>`.
 * Optional JSON body: { since, until, breakdownDays, siteId }. Default: the last 3 days.
 */
function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

export const Route = createFileRoute("/api/public/hooks/vercel-analytics")({
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

        const { isoDay } = await import("@/lib/vercel-analytics");
        let body: Record<string, unknown> = {};
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          /* empty body is fine */
        }
        const today = new Date();
        const back = new Date(today);
        back.setUTCDate(back.getUTCDate() - 2);
        const since = isoDay(body.since) ?? back.toISOString().slice(0, 10);
        const until = isoDay(body.until) ?? today.toISOString().slice(0, 10);
        const breakdownDays =
          typeof body.breakdownDays === "number" ? Math.min(5, Math.max(0, Math.floor(body.breakdownDays))) : 3;
        const siteId = typeof body.siteId === "string" ? body.siteId : undefined;

        const { syncVercelAnalytics } = await import("@/lib/vercel-analytics.server");
        try {
          const out = await syncVercelAnalytics({ since, until, breakdownDays, siteId });
          return Response.json({ ok: out.results.every((r) => r.ok), since, until, ...out });
        } catch (e) {
          return Response.json({ ok: false, error: e instanceof Error ? e.message : "failed" }, { status: 500 });
        }
      },
    },
  },
});
