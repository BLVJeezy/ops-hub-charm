import { describe, expect, it } from "vitest";
import { byDay, groupByClient, type AgendaTask } from "./task-agenda";

const t = (id: string, client: string | null, due: string | null, done = false): AgendaTask => ({ id, client_id: client, title: id, assignee: "me", due_date: due, done_at: done ? "2026-11-17T08:00:00Z" : null });

describe("groupByClient", () => {
  it("puts the client with late work first, then today, then this week", () => {
    const g = groupByClient([
      t("a1", "A", "2026-11-20"), t("b1", "B", "2026-11-17"), t("c1", "C", "2026-11-10"),
      t("d1", "D", "2026-12-01"), t("a2", "A", null), t("b2", "B", "2026-11-17", true),
    ], "2026-11-17");
    expect(g.map((x) => x.clientId)).toEqual(["C", "B", "A", "D"]);
    expect(g.find((x) => x.clientId === "B")?.open).toBe(1);   // done tasks left out
    expect(g.find((x) => x.clientId === "A")?.tasks.map((x) => x.id)).toEqual(["a1", "a2"]);   // undated last
    expect(g.find((x) => x.clientId === "A")?.next).toBe("2026-11-20");
  });
  it("keeps tasks without a client together", () => {
    expect(groupByClient([t("x", null, "2026-11-18")], "2026-11-17")[0].clientId).toBeNull();
  });
});

describe("byDay", () => {
  it("splits sorted tasks into one block per date", () => {
    expect(byDay([t("1", null, "2026-11-18"), t("2", null, "2026-11-18"), t("3", null, "2026-11-19")]).map((d) => [d.day, d.tasks.length])).toEqual([["2026-11-18", 2], ["2026-11-19", 1]]);
  });
});
