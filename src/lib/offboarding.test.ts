import { describe, expect, it } from "vitest";
import {
  buildOffboardPreviewSummary,
  detectClientServices,
  willPauseClient,
  type OffboardClientInfo,
} from "./offboarding";

const multiServiceClient: OffboardClientInfo = {
  id: "c1",
  name: "Riory BV",
  status: "Active",
  social_monthly_fee: 150,
  seo_package: "Basic",
  monthly_fee: 500,
  website_monthly_fee: 60,
};

describe("offboarding helpers", () => {
  it("detects available and active services respecting end dates", () => {
    const res = detectClientServices(
      { ...multiServiceClient, social_end_date: "2026-10-01" },
      "2026-11-27",
    );
    expect(res.available).toEqual(["social", "seo", "website"]);
    expect(res.active).toEqual(["seo", "website"]);
  });

  it("keeps client Active when another active service remains unless Alles is checked", () => {
    expect(willPauseClient(multiServiceClient, ["social"], false, true, "2026-11-27")).toBe(false);
    expect(willPauseClient(multiServiceClient, ["social"], true, true, "2026-11-27")).toBe(true);
    expect(
      willPauseClient(multiServiceClient, ["social", "seo", "website"], false, true, "2026-11-27"),
    ).toBe(true);
    expect(
      willPauseClient(multiServiceClient, ["social", "seo", "website"], true, false, "2026-11-27"),
    ).toBe(false);
  });

  it("builds a concise Dutch summary of selected actions", () => {
    const summary = buildOffboardPreviewSummary({
      stopInvoices: true,
      repeatingCount: 2,
      creditNotes: [{ amount: 150 }],
      stopTasks: true,
      activeRecurringTasksCount: 1,
      futureOpenTasksCount: 2,
      endAgreements: true,
      agreementRefs: ["SG-SM-2026-001"],
      closeVideos: true,
      videosCount: 0,
      willPause: true,
    });
    expect(summary).toContain("2 facturen stoppen");
    expect(summary).toContain("1 creditnota");
    expect(summary).toContain("3 taken uit");
    expect(summary).toContain("overeenkomst SG-SM-2026-001 beëindigd");
    expect(summary).toContain("status → Paused");
  });
});