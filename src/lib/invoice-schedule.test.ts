import { describe, expect, it } from "vitest";
import { addDays, nextOccurrence, advanceMonthNames, brusselsHour, brusselsToday, isDueAt, nextMonthlyDate } from "./invoice-schedule";

describe("nextMonthlyDate", () => {
  it("moves to the same day next month", () =>
    expect(nextMonthlyDate("2026-11-01", 1)).toBe("2026-12-01"));
  it("rolls over the year", () => expect(nextMonthlyDate("2026-12-15", 15)).toBe("2027-01-15"));
  it("clamps to short months", () => {
    expect(nextMonthlyDate("2027-01-31", 31)).toBe("2027-02-28");
    expect(nextMonthlyDate("2028-01-31", 31)).toBe("2028-02-29");
  });
  it("returns to the anchor day after a short month", () =>
    expect(nextMonthlyDate("2027-02-28", 31)).toBe("2027-03-31"));
});

describe("advanceMonthNames", () => {
  it("advances English, Dutch and French months", () => {
    expect(advanceMonthNames("SEO November 2026")).toBe("SEO December 2026");
    expect(advanceMonthNames("Hosting december 2026")).toBe("Hosting januari 2027");
    expect(advanceMonthNames("SEO août 2026")).toBe("SEO septembre 2026");
  });
  it("keeps upper case", () => expect(advanceMonthNames("SEO MEI 2026")).toBe("SEO JUNI 2026"));
  it("leaves text without month+year alone", () => {
    expect(advanceMonthNames("Website setup")).toBe("Website setup");
    expect(advanceMonthNames("Maandelijks pakket")).toBe("Maandelijks pakket");
    expect(advanceMonthNames("mei")).toBe("mei");
  });
  it("handles several mentions", () =>
    expect(advanceMonthNames("SEO oktober 2026 + hosting oktober 2026")).toBe(
      "SEO november 2026 + hosting november 2026",
    ));
});

describe("hours", () => {
  it("brusselsHour follows Belgian time incl. summer time", () => {
    expect(brusselsHour(new Date("2026-11-13T09:00:00Z"))).toBe(10);
    expect(brusselsHour(new Date("2026-07-01T09:00:00Z"))).toBe(11);
    expect(brusselsHour(new Date("2026-11-13T23:00:00Z"))).toBe(0);
  });
  it("isDueAt", () => {
    const now = new Date("2026-11-13T09:30:00Z"); // 10:30 Brussels
    expect(isDueAt("2026-11-12", 23, now)).toBe(true);
    expect(isDueAt("2026-11-13", 10, now)).toBe(true);
    expect(isDueAt("2026-11-13", 11, now)).toBe(false);
    expect(isDueAt("2026-11-14", 0, now)).toBe(false);
    expect(isDueAt("2026-11-13", null, now)).toBe(true); // default 10:00
  });
  it("addDays crosses months", () => expect(addDays("2026-11-30", 1)).toBe("2026-12-01"));
});

describe("nextOccurrence", () => {
  it("uses this month when the day is still ahead", () => expect(nextOccurrence("2026-11-13", 29)).toBe("2026-11-29"));
  it("uses next month when the day has passed or is today", () => {
    expect(nextOccurrence("2026-11-13", 1)).toBe("2026-12-01");
    expect(nextOccurrence("2026-11-13", 13)).toBe("2026-12-13");
  });
  it("clamps in short months", () => expect(nextOccurrence("2027-02-10", 31)).toBe("2027-02-28"));
});

describe("brusselsToday", () => {
  it("uses Belgian time, not UTC", () => {
    // 23:30 UTC on 30 Nov is already 1 Dec in Brussels (UTC+1)
    expect(brusselsToday(new Date("2026-11-30T23:30:00Z"))).toBe("2026-12-01");
  });
});
