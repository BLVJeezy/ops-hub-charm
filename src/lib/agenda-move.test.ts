import { describe, expect, it } from "vitest";
import { brusselsIso, moveItem, timeOf } from "./agenda";

describe("agenda moves", () => {
  it("reads Brussels wall-clock time in winter and summer", () => {
    expect(brusselsIso("2026-11-23", "14:00")).toBe("2026-11-23T13:00:00.000Z");
    expect(brusselsIso("2026-07-01", "14:00")).toBe("2026-07-01T12:00:00.000Z");
  });
  it("moves to another day at the same time and keeps the length", () => {
    const m = moveItem(
      { start: "2026-11-23T13:00:00.000Z", end: "2026-11-23T14:00:00.000Z" },
      "2026-11-25",
    );
    expect(m).toEqual({ start: "2026-11-25T13:00:00.000Z", end: "2026-11-25T14:00:00.000Z" });
    expect(timeOf(m.start)).toBe("14:00");
  });
  it("moves to a new time and length", () => {
    expect(
      moveItem(
        { start: "2026-11-23T13:00:00.000Z", end: "2026-11-23T14:00:00.000Z" },
        "2026-11-24",
        "09:30",
        90,
      ),
    ).toEqual({
      start: "2026-11-24T08:30:00.000Z",
      end: "2026-11-24T10:00:00.000Z",
    });
  });
});
