// Pure aggregation of site_daily_stats rows. Tested in site-stats.test.ts.

export type DailyRow = { day: string; kind: string; checks: number; ok: number; avg_ms: number | null; p95_ms: number | null };

export type KindSummary = { kind: string; checks: number; ok: number; rate: number | null };

export type StatsSummary = {
  uptime: number | null; // website, %
  avgMs: number | null;
  p95Ms: number | null;
  checks: number;
  byKind: KindSummary[];
  daily: Array<{ day: string; uptime: number | null; avgMs: number | null }>;
};

const pct = (ok: number, n: number) => (n ? Math.round((ok / n) * 1000) / 10 : null);

/** Summarise the last `days` days (rows are already limited by the query). */
export function summarise(rows: DailyRow[], days: number, today: string): StatsSummary {
  const since = shiftDay(today, -(days - 1));
  const inRange = rows.filter((r) => r.day >= since && r.day <= today);
  const http = inRange.filter((r) => r.kind === "http");
  const httpChecks = http.reduce((s, r) => s + r.checks, 0);
  const httpOk = http.reduce((s, r) => s + r.ok, 0);
  // weighted average of the daily averages by successful checks
  const wSum = http.reduce((s, r) => s + (r.avg_ms ?? 0) * r.ok, 0);
  const avgMs = httpOk ? Math.round(wSum / httpOk) : null;
  const p95Ms = http.length ? Math.max(...http.map((r) => r.p95_ms ?? 0)) || null : null;

  const kinds = new Map<string, { checks: number; ok: number }>();
  for (const r of inRange) {
    const k = kinds.get(r.kind) ?? { checks: 0, ok: 0 };
    k.checks += r.checks;
    k.ok += r.ok;
    kinds.set(r.kind, k);
  }
  const order = ["http", "api", "db", "deploy", "email"];
  const byKind = [...kinds.entries()]
    .map(([kind, v]) => ({ kind, ...v, rate: pct(v.ok, v.checks) }))
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));

  const daily: StatsSummary["daily"] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = shiftDay(today, -i);
    const h = http.find((r) => r.day === d);
    daily.push({ day: d, uptime: h ? pct(h.ok, h.checks) : null, avgMs: h?.avg_ms ?? null });
  }

  return {
    uptime: pct(httpOk, httpChecks),
    avgMs,
    p95Ms,
    checks: inRange.reduce((s, r) => s + r.checks, 0),
    byKind,
    daily,
  };
}

/** Mean time to resolve, in minutes, for resolved incidents. */
export function mttrMinutes(incidents: Array<{ opened_at: string; resolved_at: string | null }>): number | null {
  const done = incidents.filter((i) => i.resolved_at);
  if (!done.length) return null;
  const total = done.reduce((s, i) => s + (new Date(i.resolved_at!).getTime() - new Date(i.opened_at).getTime()), 0);
  return Math.round(total / done.length / 60000);
}

export function shiftDay(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Extract <loc> URLs from a sitemap or sitemap index. */
export function parseSitemap(xml: string): { urls: string[]; sitemaps: string[] } {
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].replace(/&amp;/g, "&"));
  const isIndex = /<sitemapindex[\s>]/i.test(xml);
  return isIndex ? { urls: [], sitemaps: locs } : { urls: locs, sitemaps: [] };
}
