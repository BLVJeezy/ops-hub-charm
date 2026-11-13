import { createFileRoute } from "@tanstack/react-router";

/**
 * Copies appointments/reservations from client sites with a read-only export
 * (site_bridges) into site_records. Called by pg_cron, or by hand.
 * Requires `Authorization: Bearer <service role key or MONITOR_CRON_SECRET>`. Optional body: { siteId }.
 */
function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

export const Route = createFileRoute("/api/public/hooks/site-records")({
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

        let siteId: string | undefined;
        try {
          const b = (await request.json()) as { siteId?: unknown };
          if (typeof b.siteId === "string") siteId = b.siteId;
        } catch {
          /* empty body is fine */
        }
        const { syncSiteRecords } = await import("@/lib/site-records.server");
        try {
          const results = await syncSiteRecords(siteId);
          return Response.json({ ok: results.every((r) => r.ok), results });
        } catch (e) {
          return Response.json({ ok: false, error: e instanceof Error ? e.message : "failed" }, { status: 500 });
        }
      },
    },
  },
});
