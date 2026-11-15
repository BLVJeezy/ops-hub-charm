import { describe, expect, it } from "vitest";
import { addMonthsIso, plannedForecast } from "./invoice-schedule";

describe("addMonthsIso", () => {
  it("clamps to month length", () => {
    expect(addMonthsIso("2026-08-31", 6)).toBe("2027-02-28");
    expect(addMonthsIso("2026-11-15", 6)).toBe("2027-05-15");
  });
});

describe("plannedForecast", () => {
  const today = "2026-11-15";
  it("counts one-off drafts once and repeats every month in the window", () => {
    const f = plannedForecast([
      { status: "Draft", total: 385, scheduled_send_at: "2026-12-15" },
      { status: "Draft", total: 685, scheduled_send_at: "2027-05-15", repeat_monthly: true, repeat_day: 15 },
      { status: "Draft", total: 500, scheduled_send_at: "2026-12-01", repeat_monthly: true, repeat_day: 1 },
      { status: "Draft", total: 85, scheduled_send_at: "2026-11-24", repeat_monthly: true, repeat_day: 24 },
    ], today);
    expect(f.until).toBe("2027-05-15");
    // 385 + 685 (15 May) + 6×500 (Dec–May) + 6×85 (Nov–Apr)
    expect(f.count).toBe(1 + 1 + 6 + 6);
    expect(f.total).toBe(385 + 685 + 3000 + 510);
  });
  it("uses next_repeat_on for sent or paid repeats and skips plain drafts", () => {
    const f = plannedForecast([
      { status: "Paid", total: 100, repeat_monthly: true, repeat_day: 1, next_repeat_on: "2026-12-01" },
      { status: "Draft", total: 999 },
      { status: "Paid", total: 50 },
    ], today);
    expect(f.count).toBe(6);
    expect(f.total).toBe(600);
  });
  it("treats an overdue draft as going out today and ignores anything past the window", () => {
    const f = plannedForecast([
      { status: "Draft", total: 10, scheduled_send_at: "2026-11-01" },
      { status: "Draft", total: 20, scheduled_send_at: "2027-06-01" },
    ], today);
    expect(f).toMatchObject({ count: 1, total: 10 });
  });
});
