import { describe, expect, it } from "vitest";
import { CHECKS, evaluate, type Evidence } from "./automation-health";
import { LIVE } from "./automations";

const NOW = Date.parse("2026-11-20T01:00:00Z");
const ago = (h: number) => new Date(NOW - h * 36e5).toISOString();
const good: Evidence = {
  cron: Object.fromEntries(
    [
      "status-hub-monitor",
      "invoice-schedule-hourly",
      "vercel-analytics-daily",
      "briefing-mail",
      "invoice-reminders-daily",
      "briefing-snapshot",
      "ledger-sync",
    ].map((j) => [j, { last_run: ago(0.1), last_status: "succeeded" }]),
  ),
  lastChecked: ago(0.1),
  lastBackup: ago(10),
  analytics: ago(10),
  briefing: ago(10),
  bookingEndpoint: true,
  requestEndpoint: true,
};

describe("automation health", () => {
  it("has a check for every live automation", () => {
    for (const a of LIVE) expect(CHECKS[a.id], a.id).toBeTypeOf("function");
  });
  it("is all ok on good evidence, except what runs outside the Hub", () => {
    const r = evaluate(
      LIVE.map((a) => a.id),
      good,
      NOW,
    );
    for (const a of LIVE)
      expect(r[a.id].status, a.id).toBe(
        a.runs === "Claude-taak" && !["stats", "briefing"].includes(a.id) ? "unknown" : "ok",
      );
  });
  it("flags a job that stopped, failed, or never ran", () => {
    const e = structuredClone(good);
    e.cron["invoice-schedule-hourly"] = { last_run: ago(3), last_status: "succeeded" };
    e.cron["ledger-sync"] = { last_run: ago(1), last_status: "failed" };
    delete e.cron["invoice-reminders-daily"];
    e.lastBackup = ago(40);
    e.bookingEndpoint = false;
    const r = evaluate(["invoices", "ledger", "reminders", "backup", "booking", "monitor"], e, NOW);
    expect(r.invoices).toMatchObject({
      status: "stale",
      detail: "invoice-schedule-hourly draaide laatst 3 u geleden",
    });
    expect(r.ledger.status).toBe("stale");
    expect(r.ledger.detail).toContain("mislukte");
    expect(r.reminders.detail).toContain("nog nooit");
    expect(r.backup.detail).toBe("Laatste back-up 40 u geleden");
    expect(r.booking.status).toBe("stale");
    expect(r.monitor.status).toBe("ok");
  });
});
