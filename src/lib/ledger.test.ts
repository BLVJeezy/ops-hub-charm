import { describe, expect, it } from "vitest";
import { balanceOf, change, journalCsv, periodOf, profitAndLoss, sameLastYear, shiftPeriod, trialBalance, type Account, type Entry, type Line } from "./ledger";

const A: Account[] = [
  { id: "bank", code: "1000", name: "Bank", type: "asset", system_key: "bank", active: true },
  { id: "deb", code: "1100", name: "Debiteuren", type: "asset", system_key: "debtors", active: true },
  { id: "rev", code: "8000", name: "Omzet", type: "income", system_key: "revenue", active: true },
  { id: "sw", code: "6000", name: "Software", type: "expense", system_key: "exp_tool", active: true },
];
const E: Entry[] = [
  { id: "e1", date: "2026-11-02", description: "Factuur 1", source: "invoice", source_id: "i1" },
  { id: "e2", date: "2026-11-10", description: "Lovable", source: "expense", source_id: "x:2026-11" },
  { id: "e3", date: "2026-10-05", description: "Factuur 0", source: "invoice", source_id: "i0" },
];
const L: Line[] = [
  { entry_id: "e1", account_id: "deb", debit: 500, credit: 0 }, { entry_id: "e1", account_id: "rev", debit: 0, credit: 500 },
  { entry_id: "e2", account_id: "sw", debit: 25, credit: 0 }, { entry_id: "e2", account_id: "bank", debit: 0, credit: 25 },
  { entry_id: "e3", account_id: "deb", debit: 300, credit: 0 }, { entry_id: "e3", account_id: "rev", debit: 0, credit: 300 },
];

describe("ledger", () => {
  it("periods", () => {
    expect(periodOf("month", "2026-02-14")).toMatchObject({ from: "2026-02-01", to: "2026-02-28", label: "feb 2026" });
    expect(periodOf("quarter", "2026-11-13")).toMatchObject({ from: "2026-10-01", to: "2026-12-31", label: "Q4 2026" });
    expect(shiftPeriod(periodOf("month", "2026-01-10"), -1).label).toBe("dec 2025");
    expect(shiftPeriod(periodOf("quarter", "2026-02-10"), -1).label).toBe("Q4 2025");
    expect(sameLastYear(periodOf("quarter", "2026-11-13")).label).toBe("Q4 2025");
    expect(sameLastYear(periodOf("year", "2026-11-13")).label).toBe("2025");
  });
  it("profit and loss", () => {
    const p = profitAndLoss(A, E, L, periodOf("month", "2026-11-01"));
    expect(p).toMatchObject({ income: 500, expense: 25, result: 475 });
    expect(profitAndLoss(A, E, L, periodOf("quarter", "2026-11-01")).income).toBe(800);
  });
  it("trial balance balances", () => {
    const t = trialBalance(A, E, L, "2026-12-31");
    expect(t.balanced).toBe(true);
    expect(t.rows.find((r) => r.account.id === "deb")?.balance).toBe(800);
    expect(t.rows.find((r) => r.account.id === "bank")?.balance).toBe(-25);
  });
  it("helpers", () => {
    expect(change(150, 100)).toBe(50);
    expect(change(5, 0)).toBeNull();
    expect(balanceOf([{ debit: 10, credit: 0 }, { debit: 0, credit: 10 }]).ok).toBe(true);
    expect(balanceOf([{ debit: 10, credit: 0 }, { debit: 0, credit: 9 }]).ok).toBe(false);
    const csv = journalCsv(A, E, L, periodOf("month", "2026-11-01"));
    expect(csv.split("\n")).toHaveLength(5);
    expect(csv).toContain('"500,00"');
  });
});
