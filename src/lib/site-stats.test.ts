import { describe, expect, it } from "vitest";
import { mttrMinutes, parseSitemap, summarise, type DailyRow } from "./site-stats";

const rows: DailyRow[] = [
  { day: "2026-11-12", kind: "http", checks: 96, ok: 96, avg_ms: 200, p95_ms: 400 },
  { day: "2026-11-13", kind: "http", checks: 96, ok: 92, avg_ms: 300, p95_ms: 900 },
  { day: "2026-11-13", kind: "db", checks: 96, ok: 96, avg_ms: 50, p95_ms: 80 },
  { day: "2026-10-01", kind: "http", checks: 96, ok: 0, avg_ms: null, p95_ms: null }, // outside 7 days
];

describe("summarise", () => {
  const s = summarise(rows, 7, "2026-11-13");
  it("computes website uptime over the period", () => expect(s.uptime).toBe(97.9));
  it("weights the average response time by successful checks", () => expect(s.avgMs).toBe(249));
  it("takes the worst daily p95", () => expect(s.p95Ms).toBe(900));
  it("gives one point per day, empty days as null", () => {
    expect(s.daily).toHaveLength(7);
    expect(s.daily[0]).toEqual({ day: "2026-11-07", uptime: null, avgMs: null });
    expect(s.daily[6]).toEqual({ day: "2026-11-13", uptime: 95.8, avgMs: 300 });
  });
  it("summarises per check type in a fixed order", () =>
    expect(s.byKind.map((k) => [k.kind, k.rate])).toEqual([["http", 97.9], ["db", 100]]));
  it("handles no data", () => expect(summarise([], 7, "2026-11-13").uptime).toBeNull());
});

describe("mttrMinutes", () => {
  it("averages resolved incidents only", () =>
    expect(
      mttrMinutes([
        { opened_at: "2026-11-13T10:00:00Z", resolved_at: "2026-11-13T10:30:00Z" },
        { opened_at: "2026-11-13T11:00:00Z", resolved_at: "2026-11-13T12:30:00Z" },
        { opened_at: "2026-11-13T12:00:00Z", resolved_at: null },
      ]),
    ).toBe(60));
});

describe("parseSitemap", () => {
  it("reads urls", () =>
    expect(parseSitemap("<urlset><url><loc>https://a.be/</loc></url><url><loc> https://a.be/x?a=1&amp;b=2 </loc></url></urlset>").urls).toEqual([
      "https://a.be/",
      "https://a.be/x?a=1&b=2",
    ]));
  it("detects a sitemap index", () =>
    expect(parseSitemap("<sitemapindex><sitemap><loc>https://a.be/s1.xml</loc></sitemap></sitemapindex>")).toEqual({
      urls: [],
      sitemaps: ["https://a.be/s1.xml"],
    }));
});
