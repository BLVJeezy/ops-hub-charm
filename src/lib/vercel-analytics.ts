/**
 * Pure helpers for Vercel Web Analytics (https://vercel.com/docs/analytics/web-analytics-api).
 * The network/database part lives in vercel-analytics.server.ts.
 */

export const VERCEL_API = "https://api.vercel.com/v1/query/web-analytics/visits/aggregate";
export const DEFAULT_TEAM_ID = "team_LMDAIL57CfPMVXgRrEHeVIzi"; // blvjeezy's projects (not a secret)

export type Dim = "requestPath" | "referrerHostname" | "deviceType" | "country";

export function aggregateUrl(opts: {
  projectId: string;
  teamId?: string;
  since: string; // YYYY-MM-DD
  until: string; // YYYY-MM-DD (inclusive)
  by: "day" | Dim;
  limit?: number;
}): string {
  const p = new URLSearchParams();
  p.set("teamId", opts.teamId || DEFAULT_TEAM_ID);
  p.set("projectId", opts.projectId);
  p.set("since", opts.since);
  p.set("until", opts.until);
  p.set("by", opts.by);
  if (opts.limit) p.set("limit", String(opts.limit));
  return `${VERCEL_API}?${p.toString()}`;
}

function rows(json: unknown): Array<Record<string, unknown>> {
  const data = (json as { data?: unknown } | null)?.data;
  return Array.isArray(data) ? (data.filter((r) => r && typeof r === "object") as Array<Record<string, unknown>>) : [];
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);

/** by=day → one row per UTC day. */
export function parseDays(json: unknown): Array<{ day: string; pageviews: number; visitors: number }> {
  const out = new Map<string, { day: string; pageviews: number; visitors: number }>();
  for (const r of rows(json)) {
    const ts = typeof r.timestamp === "string" ? r.timestamp : typeof r.day === "string" ? r.day : "";
    const day = ts.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const prev = out.get(day) ?? { day, pageviews: 0, visitors: 0 };
    prev.pageviews += num(r.pageviews);
    prev.visitors += num(r.visitors);
    out.set(day, prev);
  }
  return [...out.values()].sort((a, b) => a.day.localeCompare(b.day));
}

const DEVICE: Record<string, string> = { desktop: "Desktop", mobile: "Mobile", tablet: "Tablet" };

export function labelFor(dim: Dim, raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (dim === "referrerHostname") return s ? s.replace(/^www\./, "").toLowerCase().slice(0, 100) : "Direct";
  if (dim === "deviceType") return DEVICE[s.toLowerCase()] ?? (s || "Onbekend");
  if (dim === "country") return s ? s.toUpperCase().slice(0, 10) : "Onbekend";
  return (s || "/").slice(0, 200);
}

/** by=<dimension> → [label, pageviews], merged on label, "Others" dropped. */
export function parseDim(json: unknown, dim: Dim): Array<{ label: string; value: number }> {
  const out = new Map<string, number>();
  for (const r of rows(json)) {
    const raw = r[dim];
    if (raw === "Others") continue;
    const label = labelFor(dim, raw);
    const value = num(r.pageviews);
    if (!value) continue;
    out.set(label, (out.get(label) ?? 0) + value);
  }
  return [...out.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

/** Inclusive list of YYYY-MM-DD days. */
export function dayRange(since: string, until: string, max = 90): string[] {
  const out: string[] = [];
  const d = new Date(`${since}T00:00:00Z`);
  const end = new Date(`${until}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || Number.isNaN(end.getTime())) return out;
  while (d <= end && out.length < max) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export function isoDay(v: unknown): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null;
}
