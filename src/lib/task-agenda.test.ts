import { describe, expect, it } from "vitest";
import { dueLabel, groupTasks, type AgendaTask } from "./task-agenda";

const t = (id: string, due: string | null, done = false): AgendaTask => ({ id, client_id: null, title: id, assignee: "me", due_date: due, done_at: done ? "2026-11-17T08:00:00Z" : null });

describe("groupTasks", () => {
  const today = "2026-11-17";
  it("splits into late, today, this week, later and undated", () => {
    const g = groupTasks([t("a", "2026-11-15"), t("b", today), t("c", "2026-11-23"), t("d", "2026-11-24"), t("e", null)], today);
    expect(g.map((x) => [x.key, x.tasks.map((y) => y.id)])).toEqual([["late", ["a"]], ["today", ["b"]], ["week", ["c"]], ["later", ["d"]], ["none", ["e"]]]);
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
