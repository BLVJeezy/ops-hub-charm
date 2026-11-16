import { describe, expect, it } from "vitest";
import { ownerAlerts, videosExpected } from "./alerts";

const base = { invoices: [], clients: [], videos: [], sites: [], today: "2026-11-16" };

describe("ownerAlerts", () => {
  it("says nothing when all is well", () => {
    expect(ownerAlerts({ ...base, sites: [{ id: "s", name: "Riory", last_status: "up" }], invoices: [{ id: "a", status: "Sent", sent_at: "2026-11-10T08:00:00Z", total: 500 }] })).toEqual([]);
  });
  it("flags an invoice from day 14 and mails on day 14, 21, 28", () => {
    const at = (sent: string) => ownerAlerts({ ...base, invoices: [{ id: "a", client: "c", client_name: "Riory BV", status: "Sent", sent_at: sent, total: 500 }] });
    expect(at("2026-11-03T09:00:00Z")).toHaveLength(0);                 // 13 days
    expect(at("2026-11-02T09:00:00Z")[0]).toMatchObject({ kind: "invoice", mail: true });
    expect(at("2026-11-02T09:00:00Z")[0].title).toContain("14 dagen");
    expect(at("2026-10-30T09:00:00Z")[0].mail).toBe(false);             // 17 days: shown, not mailed again
    expect(at("2026-10-26T09:00:00Z")[0].mail).toBe(true);              // 21 days
  });
  it("ignores paid and draft invoices", () => {
    expect(ownerAlerts({ ...base, invoices: [{ id: "a", status: "Paid", sent_at: "2026-09-01T09:00:00Z" }, { id: "b", status: "Draft", sent_at: null }] })).toEqual([]);
  });
  it("shows an offline site but leaves the mail to the monitor", () => {
    expect(ownerAlerts({ ...base, sites: [{ id: "s", name: "Riory", client_id: "c", last_status: "down" }] })[0]).toMatchObject({ kind: "site", mail: false, clientId: "c" });
  });
  it("counts videos evenly over the month", () => {
    expect(videosExpected(11, "2026-11-30")).toBe(11);
    expect(videosExpected(11, "2026-11-15")).toBe(5);
    expect(videosExpected(11, "2026-11-16", "2026-11-16")).toBe(0);     // started today: nothing due yet
    expect(videosExpected(11, "2026-11-30", "2026-11-16")).toBe(11);
    expect(videosExpected(11, "2026-11-10", "2026-11-16")).toBe(0);     // not started
  });
  it("flags a client two or more videos behind, mailed on Monday", () => {
    const c = { id: "c", name: "DynaMik (SRL Energy Life)", status: "Active", social_videos_per_month: 11 };
    const vids = (n: number) => Array.from({ length: n }, () => ({ client_id: "c", month: "2026-11-01", sent_at: "2026-11-05T10:00:00Z" }));
    expect(ownerAlerts({ ...base, clients: [c], videos: vids(4) })).toHaveLength(0);          // 5 due, 4 sent: one behind is fine
    const a = ownerAlerts({ ...base, clients: [c], videos: vids(2) })[0];                     // 2026-11-16 is a Monday
    expect(a).toMatchObject({ kind: "videos", mail: true });
    expect(a.title).toBe("DynaMik: 3 video's achter");
    expect(ownerAlerts({ ...base, today: "2026-11-17", clients: [c], videos: vids(2) })[0].mail).toBe(false);
    expect(ownerAlerts({ ...base, clients: [{ ...c, is_internal: true }], videos: [] })).toHaveLength(0);
  });
});
