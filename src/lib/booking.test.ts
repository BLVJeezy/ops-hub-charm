import { describe, expect, it } from "vitest";
import { brusselsTime, checkBooking, freeSlots, whenLabel } from "./booking";

describe("booking slots", () => {
  it("knows Brussels clock time in winter and summer", () => {
    expect(brusselsTime("2026-11-20", 9).toISOString()).toBe("2026-11-20T08:00:00.000Z");
    expect(brusselsTime("2026-07-01", 9).toISOString()).toBe("2026-07-01T07:00:00.000Z");
  });
  const now = new Date("2026-11-19T13:00:00Z");   // Thursday 14:00 in Brussels
  it("offers hours from a day ahead, Monday to Saturday, never before 13:00", () => {
    const s = freeSlots(now, []);
    expect(s[0]).toBe("2026-11-20T13:00:00.000Z");   // Friday 14:00, the first hour 24 hours ahead
    expect(s.some((x) => x.startsWith("2026-11-22"))).toBe(false);   // no Sunday
    expect(s.filter((x) => x.startsWith("2026-11-21"))).toEqual(["2026-11-21T12:00:00.000Z", "2026-11-21T13:00:00.000Z", "2026-11-21T14:00:00.000Z", "2026-11-21T15:00:00.000Z", "2026-11-21T16:00:00.000Z"]);   // Saturday 13:00 … 17:00
    expect(s[s.length - 1] <= "2026-12-17T16:00:00.000Z").toBe(true);
  });
  it("leaves out anything that touches a busy time", () => {
    const s = freeSlots(now, [{ start: "2026-11-21T12:30:00Z", end: "2026-11-21T14:00:00Z" }, { start: "2026-11-21T16:00:00Z", end: "2026-11-21T22:30:00Z" }]);
    expect(s.filter((x) => x.startsWith("2026-11-21"))).toEqual(["2026-11-21T14:00:00.000Z", "2026-11-21T15:00:00.000Z"]);   // only 15:00 and 16:00 are left
  });
  it("checks what a visitor typed", () => {
    expect(checkBooking({ name: "A", email: "x@y.be", start: "2026-11-21T10:00:00Z" })).toMatchObject({ ok: false });
    expect(checkBooking({ name: "Ann", email: "nope", start: "2026-11-21T10:00:00Z" })).toMatchObject({ ok: false });
    expect(checkBooking({ name: " Ann ", email: "Ann@Y.be", start: "2026-11-21T10:00:00Z" })).toMatchObject({ ok: true, value: { name: "Ann", email: "ann@y.be" } });
  });
  it("writes the moment out in Dutch", () => {
    expect(whenLabel("2026-11-20T14:00:00.000Z")).toBe("vrijdag 20 november om 15:00");
  });
});
