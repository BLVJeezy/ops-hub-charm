import { describe, expect, it } from "vitest";
import {
  backPatch,
  clockLabel,
  donePatch,
  estimateLabel,
  pausePatch,
  startPatch,
  workedSeconds,
} from "./request-timer";

const T0 = Date.parse("2026-11-19T10:00:00Z");
describe("request timer", () => {
  it("counts banked time plus the running stretch", () => {
    expect(
      workedSeconds(
        { status: "bezig", worked_seconds: 60, run_started_at: "2026-11-19T10:00:00Z" },
        T0 + 90_000,
      ),
    ).toBe(150);
    expect(
      workedSeconds(
        { status: "gepauzeerd", worked_seconds: 60, run_started_at: null },
        T0 + 999_999,
      ),
    ).toBe(60);
  });
  it("pauses, resumes, goes back and finishes without losing time", () => {
    let c = { status: "nieuw", worked_seconds: 0, run_started_at: null as string | null };
    c = { ...c, ...startPatch(c, T0) };
    c = { ...c, ...pausePatch(c, T0 + 600_000) };
    expect(c).toMatchObject({ status: "gepauzeerd", worked_seconds: 600, run_started_at: null });
    c = { ...c, ...startPatch(c, T0 + 3_600_000) };
    c = { ...c, ...backPatch(c, T0 + 3_660_000) };
    expect(c).toMatchObject({ status: "nieuw", worked_seconds: 660 });
    c = { ...c, ...startPatch(c, T0 + 7_200_000) };
    expect(donePatch(c, T0 + 7_260_000)).toMatchObject({ status: "klaar", worked_seconds: 720 });
  });
  it("labels the clock and the estimate", () => {
    expect(clockLabel(309)).toBe("0:05:09");
    expect(clockLabel(3 * 3600 + 12 * 60)).toBe("3:12:00");
    expect(clockLabel(2 * 86400 + 4 * 3600 + 10 * 60)).toBe("2d 04:10");
    expect(estimateLabel(90)).toBe("1 uur 30 min");
    expect(estimateLabel(30)).toBe("30 min");
    expect(estimateLabel(2880)).toBe("2 dagen");
    expect(estimateLabel(null)).toBeNull();
  });
});
