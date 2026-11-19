import { describe, expect, it } from "vitest";
import {
  TABLES,
  checkQuery,
  matches,
  speechText,
  systemPrompt,
  totals,
  trimHistory,
} from "./assistant";

describe("assistant: what it may read", () => {
  it("has no secrets within reach", () => {
    const all = Object.entries(TABLES)
      .flatMap(([t, s]) => [t, ...s.cols])
      .join(" ");
    expect(all).not.toMatch(/apikey|token|secret|password|user_roles|site_bridges|hash/i);
  });
  it("refuses unknown tables, columns and ops, with a hint", () => {
    expect(() => checkQuery({ table: "user_roles" })).toThrow(/Unknown table/);
    expect(() => checkQuery({ table: "invoices", columns: ["resend_message_id"] })).toThrow(
      /Unknown column/,
    );
    expect(() =>
      checkQuery({ table: "invoices", filters: [{ column: "total", op: "like", value: 1 }] }),
    ).toThrow(/Unknown op/);
    expect(() =>
      checkQuery({ table: "invoices", filters: [{ column: "total", op: "gt" }] }),
    ).toThrow(/needs a value/);
    expect(() =>
      checkQuery({
        table: "invoices",
        filters: [{ column: "status", op: "in", value: [{ a: 1 }] }],
      }),
    ).toThrow(/needs a value/);
  });
  it("caps the limit and leaves long text columns out by default", () => {
    const q = checkQuery({ table: "invoices", limit: 9999, order_by: "date", descending: true });
    expect(q.limit).toBe(200);
    expect(q.columns).not.toContain("line_items");
    expect(q.orderBy).toBe("date");
  });
});

describe("assistant: sums", () => {
  const rows = [
    { date: "2026-10-03", total: 500, status: "Paid" },
    { date: "2026-10-20", total: 85.5, status: "Sent" },
    { date: "2026-11-01", total: "150", status: "Paid" },
  ];
  it("adds up exactly, in one group or per month", () => {
    expect(totals(rows, "total", null)).toEqual([{ group: "all", count: 3, sum: 735.5 }]);
    expect(totals(rows, "total", "date", true)).toEqual([
      { group: "2026-10", count: 2, sum: 585.5 },
      { group: "2026-11", count: 1, sum: 150 },
    ]);
  });
  it("filters worked-out columns in code", () => {
    const r = { account_name: "Software & tools", amount: -25, note: null };
    expect(matches(r, { column: "account_name", op: "ilike", value: "%software%" })).toBe(true);
    expect(matches(r, { column: "amount", op: "lt", value: 0 })).toBe(true);
    expect(matches(r, { column: "note", op: "is_null" })).toBe(true);
    expect(matches(r, { column: "account_name", op: "in", value: ["Bankkosten"] })).toBe(false);
  });
});

describe("assistant: text", () => {
  it("makes an answer speakable", () => {
    expect(speechText("**Omzet:** €1.951\n- Riory: [€500](https://x.be)")).toBe(
      "Omzet: €1.951 Riory: €500",
    );
  });
  it("keeps the last turns, starting at a question", () => {
    const turns = [
      { role: "assistant" as const, text: "hi" },
      { role: "user" as const, text: "a" },
      { role: "assistant" as const, text: "b" },
      { role: "user" as const, text: "c" },
    ];
    expect(trimHistory(turns, 3).map((m) => m.text)).toEqual(["a", "b", "c"]);
    expect(trimHistory(turns, 2).map((m) => m.text)).toEqual(["c"]);
  });
  it("puts today in the instructions", () => {
    expect(systemPrompt("2026-11-18", "Wednesday")).toContain("Wednesday 2026-11-18");
  });
});
