import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { isBot, normalizePath, sourceOf, visitorHash } from "@/lib/visits";
import { brusselsToday } from "@/lib/invoice-schedule";

/**
 * Page view counter used by /t.js on client sites. Always answers 204 so a site
 * never shows an error. Counts only real browsers on the site's own domain.
 */
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};
const done = () => new Response(null, { status: 204, headers: CORS });
const bare = (h: string) => h.replace(/^www\./, "").toLowerCase();

export const Route = createFileRoute("/api/public/t")({
  server: {
    handlers: {
      OPTIONS: async () => done(),
      POST: async ({ request }) => {
        try {
          const supabaseUrl = process.env.SUPABASE_URL;
          const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          if (!supabaseUrl || !serviceKey) return done();

          const ua = request.headers.get("user-agent") ?? "";
          if (isBot(ua)) return done();

          const raw = await request.text();
          if (raw.length > 2000) return done();
          const body = JSON.parse(raw) as { s?: unknown; u?: unknown; r?: unknown };
          if (
            typeof body.s !== "string" ||
            !/^[a-f0-9]{16,64}$/.test(body.s) ||
            typeof body.u !== "string"
          )
            return done();

          const db = createClient(supabaseUrl, serviceKey);
          const { data: site } = await db
            .from("monitored_sites" as never)
            .select("url")
            .eq("tracking_id", body.s)
            .maybeSingle();
          const siteUrl = (site as { url?: string } | null)?.url;
          if (!siteUrl) return done();

          // Only count views on the site's own domain (not previews or copies).
          let pageHost = "";
          try {
            pageHost = new URL(body.u).hostname;
          } catch {
            return done();
          }
          if (bare(pageHost) !== bare(new URL(siteUrl).hostname)) return done();

          const day = brusselsToday();
          const ip =
            request.headers.get("cf-connecting-ip") ??
            request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
            "";
          const hash = await visitorHash(serviceKey, day, body.s, ip, ua);

          await db.rpc(
            "track_pageview" as never,
            {
              _tracking_id: body.s,
              _day: day,
              _hash: hash,
              _path: normalizePath(body.u),
              _source: sourceOf(body.r, body.u),
            } as never,
          );
        } catch {
          /* never fail the visitor's page */
        }
        return done();
      },
    },
  },
});
