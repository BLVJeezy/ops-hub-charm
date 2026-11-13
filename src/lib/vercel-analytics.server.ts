import { aggregateUrl, dayRange, parseDays, parseDim, type Dim } from "./vercel-analytics";

/**
 * Copies Vercel Web Analytics into the Hub (source 'vercel') for every site with
 * analytics_provider = 'vercel'. Needs the VERCEL_TOKEN secret.
 *
 * Cloudflare Workers allow a limited number of outgoing requests per call, so
 * per-day breakdowns (pages, sources, devices, countries) are fetched only for
 * `breakdownDays` (default 2) most recent days of the range; the daily totals are
 * fetched for the whole range in one request.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function admin(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type VercelSyncResult = {
  site: string;
  ok: boolean;
  days?: number;
  visitors?: number;
  pageviews?: number;
  error?: string;
};

const DIMS: Dim[] = ["requestPath", "referrerHostname", "deviceType", "country"];

async function query(url: string, token: string): Promise<unknown> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    let msg = "";
    try {
      const b = (await res.json()) as { error?: { message?: string } };
      msg = b?.error?.message ?? "";
    } catch {
      /* ignore */
    }
    throw new Error(`Vercel ${res.status}${msg ? `: ${msg}` : ""}`);
  }
  return res.json();
}

export async function syncVercelAnalytics(opts: {
  since: string;
  until: string;
  breakdownDays?: number;
  siteId?: string;
}): Promise<{ results: VercelSyncResult[] }> {
  const token = process.env.VERCEL_TOKEN;
  if (!token) throw new Error("VERCEL_TOKEN ontbreekt");
  const teamId = process.env.VERCEL_TEAM_ID || undefined;
  const db = await admin();

  let q = db
    .from("monitored_sites")
    .select("id,name,vercel_project_id")
    .eq("analytics_provider", "vercel")
    .not("vercel_project_id", "is", null);
  if (opts.siteId) q = q.eq("id", opts.siteId);
  const { data: sites, error } = await q;
  if (error) throw new Error(error.message);

  const days = dayRange(opts.since, opts.until);
  const breakdownFor = days.slice(-Math.max(0, opts.breakdownDays ?? 2));
  const results: VercelSyncResult[] = [];

  for (const site of (sites ?? []) as Array<{ id: string; name: string; vercel_project_id: string }>) {
    try {
      const base = { projectId: site.vercel_project_id, teamId };
      const series = parseDays(
        await query(aggregateUrl({ ...base, since: opts.since, until: opts.until, by: "day" }), token),
      );
      // Days without visits come back missing: store them as 0 so the chart is complete.
      const byDay = new Map(series.map((r) => [r.day, r]));
      const visitRows = days.map((day) => ({
        site_id: site.id,
        day,
        pageviews: byDay.get(day)?.pageviews ?? 0,
        visitors: byDay.get(day)?.visitors ?? 0,
        source: "vercel",
      }));
      if (visitRows.length) {
        const { error: e } = await db.from("site_visits_daily").upsert(visitRows, { onConflict: "site_id,day" });
        if (e) throw new Error(e.message);
      }

      const pages: Array<Record<string, unknown>> = [];
      const sources: Array<Record<string, unknown>> = [];
      const breakdown: Array<Record<string, unknown>> = [];
      for (const day of breakdownFor) {
        for (const dim of DIMS) {
          const list = parseDim(
            await query(aggregateUrl({ ...base, since: day, until: day, by: dim, limit: 25 }), token),
            dim,
          );
          for (const { label, value } of list) {
            if (dim === "requestPath") pages.push({ site_id: site.id, day, path: label, views: value });
            else if (dim === "referrerHostname") sources.push({ site_id: site.id, day, source: label, views: value });
            else breakdown.push({ site_id: site.id, day, dim: dim === "deviceType" ? "device" : "country", label, value });
          }
        }
      }
      if (breakdownFor.length) {
        // Replace those days so a re-run never double counts.
        for (const table of ["site_pages_daily", "site_sources_daily", "site_breakdown_daily"]) {
          const { error: e } = await db.from(table).delete().eq("site_id", site.id).in("day", breakdownFor);
          if (e) throw new Error(e.message);
        }
        if (pages.length) await db.from("site_pages_daily").insert(pages);
        if (sources.length) await db.from("site_sources_daily").insert(sources);
        if (breakdown.length) await db.from("site_breakdown_daily").insert(breakdown);
      }

      await db.from("monitored_sites").update({ analytics_synced_at: new Date().toISOString() }).eq("id", site.id);
      results.push({
        site: site.name,
        ok: true,
        days: days.length,
        visitors: visitRows.reduce((a, r) => a + r.visitors, 0),
        pageviews: visitRows.reduce((a, r) => a + r.pageviews, 0),
      });
    } catch (e) {
      results.push({ site: site.name, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { results };
}
