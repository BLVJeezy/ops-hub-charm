import { describe, expect, it } from "vitest";
import { ago, fresh, LIVE, PLANNED, SOURCES, TARGETS } from "./automations";

const now = Date.parse("2026-11-17T10:00:00Z");
describe("automations", () => {
  it("has unique ids and no entry in both lists", () => {
    const ids = [...LIVE, ...PLANNED].map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("wires every automation to known sources and targets, and leaves none of them loose", () => {
    const src = new Set(SOURCES.map((x) => x.id)), tgt = new Set(TARGETS.map((x) => x.id));
    for (const a of LIVE) {
      expect(a.from.length, a.id).toBeGreaterThan(0);
      expect(a.to.length, a.id).toBeGreaterThan(0);
      a.from.forEach((f) => expect(src.has(f), `${a.id} ← ${f}`).toBe(true));
      a.to.forEach((x) => expect(tgt.has(x), `${a.id} → ${x}`).toBe(true));
    }
    SOURCES.forEach((x) => expect(LIVE.some((a) => a.from.includes(x.id)), x.id).toBe(true));
    TARGETS.forEach((x) => expect(LIVE.some((a) => a.to.includes(x.id)), x.id).toBe(true));
  });
  it("says how long ago something ran", () => {
    expect(ago("2026-11-17T09:57:00Z", now)).toBe("3 min geleden");
    expect(ago("2026-11-17T04:00:00Z", now)).toBe("6 uur geleden");
    expect(ago("2026-11-16T09:00:00Z", now)).toBe("gisteren");
    expect(ago("2026-11-10T09:00:00Z", now)).toBe("7 dagen geleden");
    expect(ago(null, now)).toBeNull();
  });
  it("judges freshness by rhythm", () => {
    expect(fresh("2026-11-17T09:40:00Z", "always", now)).toBe(true);
    expect(fresh("2026-11-17T07:00:00Z", "always", now)).toBe(false);
    expect(fresh("2026-11-16T08:00:00Z", "daily", now)).toBe(true);
    expect(fresh("2026-11-15T08:00:00Z", "daily", now)).toBe(false);
    expect(fresh(null, "daily", now)).toBeNull();
  });
});
