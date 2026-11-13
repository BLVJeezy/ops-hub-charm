import { describe, expect, it } from "vitest";
import { aggregateUrl, dayRange, isoDay, labelFor, parseDays, parseDim } from "./vercel-analytics";

describe("vercel analytics helpers", () => {
  it("builds the aggregate url with team default", () => {
    const u = new URL(aggregateUrl({ projectId: "prj_1", since: "2026-11-01", until: "2026-11-07", by: "day" }));
    expect(u.pathname).toBe("/v1/query/web-analytics/visits/aggregate");
    expect(u.searchParams.get("teamId")).toBe("team_LMDAIL57CfPMVXgRrEHeVIzi");
    expect(u.searchParams.get("since")).toBe("2026-11-01");
    expect(u.searchParams.get("by")).toBe("day");
  });

  it("parses daily rows", () => {
    const rows = parseDays({
      data: [
        { timestamp: "2026-11-02T00:00:00.000Z", pageviews: 5, visitors: 3 },
        { timestamp: "2026-11-01T00:00:00.000Z", pageviews: 2, visitors: 1 },
        { timestamp: "nonsense", pageviews: 9 },
      ],
    });
    expect(rows).toEqual([
      { day: "2026-11-01", pageviews: 2, visitors: 1 },
      { day: "2026-11-02", pageviews: 5, visitors: 3 },
    ]);
    expect(parseDays(null)).toEqual([]);
  });

  it("parses dimensions and labels", () => {
    expect(
      parseDim(
        { data: [{ referrerHostname: "www.Google.com", pageviews: 4 }, { referrerHostname: null, pageviews: 2 }, { referrerHostname: "Others", pageviews: 9 }] },
        "referrerHostname",
      ),
    ).toEqual([
      { label: "google.com", value: 4 },
      { label: "Direct", value: 2 },
    ]);
    expect(labelFor("deviceType", "mobile")).toBe("Mobile");
    expect(labelFor("country", "be")).toBe("BE");
    expect(labelFor("requestPath", "")).toBe("/");
  });

  it("day helpers", () => {
    expect(dayRange("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
    expect(isoDay("2026-11-13")).toBe("2026-11-13");
    expect(isoDay("13/11")).toBeNull();
  });
});
