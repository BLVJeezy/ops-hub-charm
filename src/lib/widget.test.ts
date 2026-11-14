import { describe, expect, it } from "vitest";
import { widgetPayload } from "./widget";

const site = (name: string, last_status: string, y: number, b: number) =>
  ({ id: name, name, last_status, last_response_ms: 200, visitors_yesterday: y, visitors_day_before: b, new_24h: 1, upcoming_7d: 2, incidents: [] }) as never;

describe("widgetPayload", () => {
  const snap = { day: "2026-11-14", sites: [site("A", "up", 30, 20), site("B", "down", 10, 20)], invoices: { open_count: 2, open_total: 585.4 } };
  const p = widgetPayload(snap, [], 500, new Date("2026-11-14T10:00:00Z"));

  it("summarises status, sites and traffic", () => {
    expect(p.status).toBe("critical");
    expect(p.online).toBe(1);
    expect(p.total).toBe(2);
    expect(p.visitors).toBe(40);
    expect(p.visitorsDelta).toBe(0);
    expect(p.fresh).toBe(2);
    expect(p.openInvoices).toBe(2);
    expect(p.openTotal).toBe(585);
    expect(p.paidThisMonth).toBe(500);
  });

  it("carries only totals and site names, no customer fields", () => {
    expect(Object.keys(p.sites[0]).sort()).toEqual(["ms", "name", "state"]);
    expect(JSON.stringify(p)).not.toMatch(/email|phone|customer/i);
  });

  it("has no delta without a previous day", () => {
    expect(widgetPayload({ day: "x", sites: [site("A", "up", 5, 0)] }, [], 0).visitorsDelta).toBeNull();
  });
});
