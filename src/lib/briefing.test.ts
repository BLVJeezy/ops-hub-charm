import { describe, expect, it } from "vitest";
import { backupIssues, briefingMail, briefingStatus, brusselsHour, siteState, totals, type Snapshot } from "./briefing";

const base: Snapshot = {
  day: "2026-11-13",
  sites: [
    { id: "a", name: "Riory", last_status: "up", uptime24: 100, visitors_yesterday: 32, visitors_7d: 198, new_24h: 4, incidents: [] },
    { id: "b", name: "GiGi", last_status: "up", uptime24: 100, visitors_yesterday: 5, visitors_7d: 44, new_24h: 0, incidents: [] },
  ],
  invoices: { overdue_count: 0 },
};

describe("briefing", () => {
  it("states", () => {
    expect(briefingStatus(base)).toBe("ok");
    expect(siteState({ id: "x", name: "x", last_status: "down" })).toBe("down");
    expect(siteState({ id: "x", name: "x", last_status: "up", uptime24: 97.5 })).toBe("warn");
    expect(siteState({ id: "x", name: "x", last_status: "up", incidents: [{ severity: "critical", title: "t", status: "open" }] })).toBe("down");
    const crit = { ...base, sites: [...base.sites, { id: "c", name: "Villa", last_status: "down" }] };
    expect(briefingStatus(crit)).toBe("critical");
  });
  it("totals and mail", () => {
    expect(totals(base)).toMatchObject({ visitors: 37, week: 242, fresh: 4 });
    const m = briefingMail(base, "https://hub/briefing", true);
    expect(m.subject).toContain("Alles in orde");
    expect(m.html).toContain("Riory");
    expect(m.html).toContain("Bekijk de video");
    expect(briefingMail({ ...base, sites: [{ id: "z", name: "<b>x</b>", last_status: "down" }] }, null, false).html).not.toContain("<b>x</b>");
  });
  it("brussels hour handles DST", () => {
    expect(brusselsHour(new Date("2026-11-13T11:00:00Z"))).toBe(12);
    expect(brusselsHour(new Date("2026-07-13T10:00:00Z"))).toBe(12);
  });
});

describe("backups in the briefing", () => {
  const base = { day: "2026-11-14", sites: [] };
  it("warns when a backup failed or is stale", () => {
    const snap = { ...base, backups: [{ target: "hub", ok: true, at: "x" }, { target: "riory", ok: false, at: "x" }] };
    expect(backupIssues(snap)).toEqual(["riory"]);
    expect(briefingStatus(snap)).toBe("warning");
    expect(briefingStatus({ ...base, backups: [{ target: "hub", ok: true, at: "x", stale: true }] })).toBe("warning");
  });
  it("stays ok when all backups succeeded or none exist yet", () => {
    expect(briefingStatus({ ...base, backups: [{ target: "hub", ok: true, at: "x", stale: false }] })).toBe("ok");
    expect(briefingStatus(base)).toBe("ok");
    expect(briefingMail({ ...base, backups: [{ target: "hub", ok: false, at: "x" }] }, null, false).html).toContain("Back-up niet gelukt: hub");
  });
});
