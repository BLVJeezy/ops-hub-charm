import { describe, expect, it } from "vitest";
import { clock, dueLabel, elapsed, groupTasks, lapTimes, spent, stepWord, weekEnd, type AgendaTask } from "./task-agenda";

const t = (id: string, due: string | null, done = false): AgendaTask => ({ id, client_id: null, title: id, assignee: "me", due_date: due, done_at: done ? "2026-11-17T08:00:00Z" : null });

describe("groupTasks", () => {
  const today = "2026-11-17";
  it("splits into late, today, this week, next week, later and undated", () => {
    // 2026-11-17 is a Tuesday: this week ends Sunday 22, next week Sunday 29
    const g = groupTasks([t("a", "2026-11-15"), t("b", today), t("c", "2026-11-22"), t("n", "2026-11-23"), t("n2", "2026-11-29"), t("d", "2026-11-30"), t("e", null)], today);
    expect(g.map((x) => [x.key, x.tasks.map((y) => y.id)])).toEqual([["late", ["a"]], ["today", ["b"]], ["week", ["c"]], ["next", ["n", "n2"]], ["later", ["d"]], ["none", ["e"]]]);
    expect(g.find((x) => x.key === "next")?.range).toBe("ma 23 nov – zo 29 nov");
    expect(g.find((x) => x.key === "today")?.range).toBe("di 17 nov");
  });
  it("on a Sunday the week is over: tomorrow is next week", () => {
    expect(weekEnd("2026-11-22")).toBe("2026-11-22");
    expect(groupTasks([t("m", "2026-11-23")], "2026-11-22")[0].key).toBe("next");
  });
  it("leaves out empty groups and keeps ticked tasks under today, after the open ones", () => {
    const g = groupTasks([t("late-done", "2026-11-10", true), t("b", today)], today);
    expect(g).toHaveLength(1);
    expect(g[0].tasks.map((x) => x.id)).toEqual(["b", "late-done"]);
  });
  it("orders by date within a group", () => {
    expect(groupTasks([t("x", "2026-11-20"), t("y", "2026-11-18")], today)[0].tasks.map((x) => x.id)).toEqual(["y", "x"]);
  });
});
describe("dueLabel", () => {
  it("names near days and dates the rest", () => {
    expect(dueLabel("2026-11-17", "2026-11-17")).toBe("vandaag");
    expect(dueLabel("2026-11-18", "2026-11-17")).toBe("morgen");
    expect(dueLabel("2026-11-16", "2026-11-17")).toBe("gisteren");
    expect(dueLabel("2026-11-20", "2026-11-17")).toBe("vr 20 nov");
    expect(dueLabel(null, "2026-11-17")).toBe("geen datum");
  });
});

describe("timer", () => {
  const now = Date.parse("2026-11-17T10:00:00Z");
  it("adds the running stretch to the banked time", () => {
    expect(elapsed({ started_at: null, seconds: 300 }, now)).toBe(300);
    expect(elapsed({ started_at: "2026-11-17T09:58:00Z", seconds: 300 }, now)).toBe(420);
    expect(elapsed({ started_at: "2026-11-17T10:05:00Z", seconds: 0 }, now)).toBe(0);      // a clock that is ahead never gives negative time
  });
  it("formats clocks and durations", () => {
    expect(clock(7)).toBe("0:07"); expect(clock(247)).toBe("4:07"); expect(clock(3750)).toBe("1:02:30");
    expect(spent(45)).toBe("45 sec"); expect(spent(1920)).toBe("32 min"); expect(spent(3900)).toBe("1 u 05");
  });
  it("names the pieces and times each one", () => {
    expect(stepWord("Video's maken (3 deze week)")).toBe("Video");
    expect(stepWord("Offerte uitwerken")).toBe("Stap");
    expect(lapTimes([600, 1500, 1800])).toEqual([600, 900, 300]);
    expect(lapTimes(null)).toEqual([]);
  });
});
