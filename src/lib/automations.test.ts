import { describe, expect, it } from "vitest";
import { ago, fresh, LIVE, PLANNED } from "./automations";

const now = Date.parse("2026-11-17T10:00:00Z");
describe("automations", () => {
  it("has unique ids and no entry in both lists", () => {
    const ids = [...LIVE, ...PLANNED].map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
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
