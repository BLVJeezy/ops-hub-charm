import { describe, expect, it } from "vitest";
import { byDay, groupByClient, type AgendaTask } from "./task-agenda";

const t = (id: string, client: string | null, due: string | null, done = false): AgendaTask => ({
  id,
  client_id: client,
  title: id,
  assignee: "me",
  due_date: due,
  done_at: done ? "2026-11-17T08:00:00Z" : null,
});

describe("groupByClient", () => {
  it("puts the client with late work first, then today, then this week", () => {
    const g = groupByClient(
      [
        t("a1", "A", "2026-11-20"),
        t("b1", "B", "2026-11-17"),
        t("c1", "C", "2026-11-10"),
        t("d1", "D", "2026-12-01"),
        t("a2", "A", null),
        t("b2", "B", "2026-11-17", true),
      ],
      "2026-11-17",
    );
    expect(g.map((x) => x.clientId)).toEqual(["C", "B", "A", "D"]);
    expect(g.find((x) => x.clientId === "B")?.open).toBe(1); // done tasks left out
    expect(g.find((x) => x.clientId === "A")?.tasks.map((x) => x.id)).toEqual(["a1", "a2"]); // undated last
    expect(g.find((x) => x.clientId === "A")?.next).toBe("2026-11-20");
  });
  it("keeps tasks without a client together", () => {
    expect(groupByClient([t("x", null, "2026-11-18")], "2026-11-17")[0].clientId).toBeNull();
  });
});

describe("byDay", () => {
  it("splits sorted tasks into one block per date", () => {
    expect(
      byDay([
        t("1", null, "2026-11-18"),
        t("2", null, "2026-11-18"),
        t("3", null, "2026-11-19"),
      ]).map((d) => [d.day, d.tasks.length]),
    ).toEqual([
      ["2026-11-18", 2],
      ["2026-11-19", 1],
    ]);
  });
});

import { dayBlocks } from "./task-agenda";
describe("dayBlocks", () => {
  it("gives each project its tasks for the day, late ones included, in the order of the blocks", () => {
    const b = dayBlocks(
      [
        t("v1", "V", "2026-11-18"),
        t("v0", "V", "2026-11-10"),
        t("d1", "D", "2026-11-18"),
        t("x", "X", "2026-11-18"),
      ],
      ["D", "V"],
      "2026-11-18",
      "2026-11-18",
      0,
    );
    expect(b.map((x) => [x.clientId, x.tasks.map((y) => y.id), x.upcoming])).toEqual([
      ["D", ["d1"], false],
      ["V", ["v0", "v1"], false],
    ]);
  });
  it("fills an empty block with the next three tasks", () => {
    const b = dayBlocks(
      [
        t("a", "A", "2026-11-25"),
        t("b", "A", null),
        t("c", "A", "2026-11-20"),
        t("d", "A", "2026-12-01"),
      ],
      ["A"],
      "2026-11-18",
      "2026-11-18",
      0,
    );
    expect(b[0].upcoming).toBe(true);
    expect(b[0].tasks.map((x) => x.id)).toEqual(["c", "a", "d"]);
  });
});
