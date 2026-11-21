import { describe, expect, it } from "vitest";
import { outlook, outlookTotals } from "./finance-outlook";

describe("outlook", () => {
  it("turns planned revenue and fixed costs into a profit range", () => {
    const rows = outlook([{ month: "2026-12", total: 1270 }], 300, { pct: 20, perMonth: 40 });
    expect(rows[0]).toEqual({ month: "2026-12", revenue: 1270, costLow: 300, costHigh: 400, profitLow: 870, profitHigh: 970 });
  });
  it("adds months up and allows a loss", () => {
    const rows = outlook([{ month: "a", total: 100 }, { month: "b", total: 500 }], 200, { pct: 0, perMonth: 0 });
    expect(outlookTotals(rows)).toEqual({ revenue: 600, costLow: 400, costHigh: 400, profitLow: 200, profitHigh: 200 });
    expect(rows[0].profitLow).toBe(-100);
  });
});
