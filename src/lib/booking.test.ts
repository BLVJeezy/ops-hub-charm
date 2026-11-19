import { describe, expect, it } from "vitest";
import { brusselsTime, checkBooking, checkFiles, freeSlots, safeName, whenLabel } from "./booking";

describe("booking slots", () => {
  it("knows Brussels clock time in winter and summer", () => {
    expect(brusselsTime("2026-11-20", 9).toISOString()).toBe("2026-11-20T08:00:00.000Z");
    expect(brusselsTime("2026-07-01", 9).toISOString()).toBe("2026-07-01T07:00:00.000Z");
  });
  const now = new Date("2026-11-19T13:00:00Z");   // Thursday 14:00 in Brussels
  it("offers hours from a day ahead, Monday to Saturday, between 13:00 and 17:00", () => {
    const s = freeSlots(now, []);
    expect(s[0]).toBe("2026-11-20T13:00:00.000Z");   // Friday 14:00, the first hour 24 hours ahead
    expect(s.some((x) => x.startsWith("2026-11-22"))).toBe(false);   // no Sunday
    expect(s.filter((x) => x.startsWith("2026-11-21"))).toEqual(["2026-11-21T12:00:00.000Z", "2026-11-21T13:00:00.000Z", "2026-11-21T14:00:00.000Z", "2026-11-21T15:00:00.000Z"]);   // Saturday 13:00 … 16:00, done by 17:00
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
  it("asks for an address only when meeting on location", () => {
    const base = { name: "Ann", email: "ann@y.be", start: "2026-11-21T12:00:00Z" };
    expect(checkBooking({ ...base, mode: "onsite" })).toMatchObject({ ok: false, error: "Vul het adres in waar we afspreken." });
    expect(checkBooking({ ...base, mode: "onsite", location: "Markt 1, Tongeren" })).toMatchObject({ ok: true, value: { mode: "onsite", location: "Markt 1, Tongeren" } });
    expect(checkBooking({ ...base, location: "Markt 1" })).toMatchObject({ ok: true, value: { mode: "online", location: "" } });
  });
  it("keeps only the topics that exist", () => {
    const r = checkBooking({ name: "Ann", email: "ann@y.be", start: "2026-11-21T12:00:00Z", topics: "SEO,Hacken, Social media" });
    expect(r).toMatchObject({ ok: true, value: { topics: ["SEO", "Social media"] } });
  });
  it("accepts a few photos and PDFs, nothing else and nothing huge", () => {
    const f = (name: string, type: string, mb: number) => ({ name, type, size: mb * 1024 * 1024 });
    expect(checkFiles([f("a.jpg", "image/jpeg", 3), f("plan.pdf", "application/pdf", 2)])).toBeNull();
    expect(checkFiles([f("a.exe", "application/x-msdownload", 1)])).toContain("alleen foto's");
    expect(checkFiles([f("a.jpg", "image/jpeg", 9)])).toContain("te groot");
    expect(checkFiles(Array.from({ length: 6 }, (_, i) => f(`${i}.png`, "image/png", 1)))).toContain("hoogstens 5");
    expect(checkFiles([f("a.jpg", "image/jpeg", 7), f("b.jpg", "image/jpeg", 7), f("c.jpg", "image/jpeg", 7)])).toContain("Samen");
    expect(safeName("Foto van gevel (1).JPG")).toBe("Foto-van-gevel-1.JPG");
    expect(safeName("../../etc/passwd")).toBe("....etcpasswd");
  });
});
