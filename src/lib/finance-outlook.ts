import type { ServiceMonth } from "./invoice-schedule";

/** How much extra cost to expect on top of the fixed monthly tools. */
export type CostBuffer = {
  /** Extra on top of fixed costs, in percent (price rises, extra credits, usage). */
  pct: number;
  /** Fixed extra per month for things you can't name yet (domains, hardware, one-off tools). */
  perMonth: number;
};

export const DEFAULT_BUFFER: CostBuffer = { pct: 25, perMonth: 50 };

export type OutlookMonth = {
  month: string;
  revenue: number;
  costLow: number;
  costHigh: number;
  profitLow: number;
  profitHigh: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Revenue, costs and profit per month. Revenue comes from the planned invoices;
 * costs are a range: the fixed monthly costs (low) up to fixed costs plus a buffer (high).
 * Profit is therefore a range too, before tax.
 */
export function outlook(
  revenue: Pick<ServiceMonth, "month" | "total">[],
  fixedMonthly: number,
  buffer: CostBuffer,
): OutlookMonth[] {
  const low = Math.max(0, fixedMonthly);
  const high = low * (1 + Math.max(0, buffer.pct) / 100) + Math.max(0, buffer.perMonth);
  return revenue.map((m) => ({
    month: m.month,
    revenue: r2(m.total),
    costLow: r2(low),
    costHigh: r2(high),
    profitLow: r2(m.total - high),
    profitHigh: r2(m.total - low),
  }));
}

export function outlookTotals(rows: OutlookMonth[]) {
  const sum = (k: keyof Omit<OutlookMonth, "month">) => r2(rows.reduce((a, r) => a + r[k], 0));
  return {
    revenue: sum("revenue"),
    costLow: sum("costLow"),
    costHigh: sum("costHigh"),
    profitLow: sum("profitLow"),
    profitHigh: sum("profitHigh"),
  };
}
