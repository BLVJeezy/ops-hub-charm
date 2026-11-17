import { describe, expect, it } from "vitest";
import { READABLE, checkRead, checkTask, cleanMessages, systemPrompt } from "./assistant";

describe("checkRead", () => {
  it("refuses tables and columns that are not on the list", () => {
    expect(checkRead({ table: "site_bridges" }).ok).toBe(false);
    expect(checkRead({ table: "user_roles" }).ok).toBe(false);
    expect(checkRead({ table: "constructor" }).ok).toBe(false);
    expect(checkRead({ table: "monitored_sites", columns: ["db_health_apikey"] }).ok).toBe(false);
    expect(checkRead({ table: "monitored_sites", filters: [{ column: "db_health_apikey", op: "not_null" }] }).ok).toBe(false);
    expect(checkRead({ table: "clients", order_by: "nope" }).ok).toBe(false);
  });
  it("never exposes keys, tokens or hashes", () => {
    const all = Object.values(READABLE).flatMap((t) => t.columns);
    // system_key on ledger_accounts names a built-in account; it is not a credential.
    expect(all.filter((c) => c !== "system_key" && /apikey|_key$|token|hash|secret|password/i.test(c))).toEqual([]);
  });
  it("defaults to all readable columns and caps the limit", () => {
    const r = checkRead({ table: "client_tasks", limit: 5000 });
    expect(r.ok && r.request.columns).toEqual(READABLE.client_tasks.columns);
    expect(r.ok && r.request.limit).toBe(100);
    expect(r.ok && r.request.ascending).toBe(true);
  });
  it("checks filters", () => {
    expect(checkRead({ table: "client_tasks", filters: [{ column: "done_at", op: "is_null" }] }).ok).toBe(true);
    expect(checkRead({ table: "client_tasks", filters: [{ column: "title", op: "like" }] }).ok).toBe(false);
    expect(checkRead({ table: "client_tasks", filters: [{ column: "title", op: "eq" }] }).ok).toBe(false);
    expect(checkRead({ table: "client_tasks", filters: [{ column: "client_id", op: "in", value: "x" }] }).ok).toBe(false);
  });
});

describe("checkTask", () => {
  it("accepts a plain task and defaults to me", () => {
    expect(checkTask({ title: " Call Yordi ", due_date: "2026-11-24" })).toEqual({ ok: true, task: { title: "Call Yordi", due_date: "2026-11-24", assignee: "me", client_id: null } });
  });
  it("refuses bad dates, empty titles and made-up client ids", () => {
    expect(checkTask({ title: "x", due_date: "next week" }).ok).toBe(false);
    expect(checkTask({ title: "", due_date: "2026-11-24" }).ok).toBe(false);
    expect(checkTask({ title: "x", due_date: "2026-11-24", client_id: "Riory" }).ok).toBe(false);
  });
});

describe("cleanMessages", () => {
  it("keeps text turns, merges doubles and ends on the user", () => {
    const out = cleanMessages([{ role: "assistant", content: "hi" }, { role: "user", content: "a" }, { role: "user", content: "b" }, { role: "system", content: "x" }]);
    expect(out).toEqual([{ role: "user", content: "a\n\nb" }]);
  });
  it("refuses a conversation that does not end with a question", () => {
    expect(() => cleanMessages([{ role: "user", content: "a" }, { role: "assistant", content: "b" }])).toThrow();
    expect(() => cleanMessages(null)).toThrow();
  });
  it("drops the oldest turns and starts on a user turn", () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: String(i) }));
    const out = cleanMessages([...many, { role: "user", content: "last" }], 6);
    expect(out[0].role).toBe("user");
    expect(out[out.length - 1].content).toBe("last");
    expect(out.length).toBeLessThanOrEqual(6);
  });
});

describe("systemPrompt", () => {
  it("carries the date, the knowledge and the readable tables", () => {
    const p = systemPrompt({ today: "2026-11-17", weekday: "Tuesday", knowledge: "SEO from €350 per month", page: "/clients" });
    expect(p).toContain("Tuesday 2026-11-17");
    expect(p).toContain("SEO from €350 per month");
    expect(p).toContain("- invoices:");
    expect(p).toContain("/clients");
  });
});
