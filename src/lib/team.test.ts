import { describe, expect, it } from "vitest";
import { memberOpen, memberSeesClient, pickAssignee, type TeamMember } from "./team";

const m = (o: Partial<TeamMember> & { user_id: string; open_items?: number }): TeamMember & { open_items?: number } => ({
  full_name: o.user_id, email: `${o.user_id}@x.be`, title: null, access_until: null, active: true, auto_kinds: [], client_ids: null, ...o,
});

describe("team rules", () => {
  it("closes access when stopped or past the end date", () => {
    expect(memberOpen({ active: true, access_until: null }, "2026-11-22")).toBe(true);
    expect(memberOpen({ active: true, access_until: "2026-11-22" }, "2026-11-22")).toBe(true);
    expect(memberOpen({ active: true, access_until: "2026-11-21" }, "2026-11-22")).toBe(false);
    expect(memberOpen({ active: false, access_until: null }, "2026-11-22")).toBe(false);
  });
  it("limits clients only when a list is set", () => {
    expect(memberSeesClient({ client_ids: null }, "a")).toBe(true);
    expect(memberSeesClient({ client_ids: ["a"] }, "b")).toBe(false);
    expect(memberSeesClient({ client_ids: ["a"] }, null)).toBe(false);
  });
  it("assigns to the matching, most specific, least busy member", () => {
    const team = [
      m({ user_id: "all", auto_kinds: ["social"], open_items: 0 }),
      m({ user_id: "amano", auto_kinds: ["social"], client_ids: ["c1"], open_items: 5 }),
      m({ user_id: "seo", auto_kinds: ["seo"] }),
      m({ user_id: "gone", auto_kinds: ["social"], access_until: "2026-01-01" }),
    ];
    expect(pickAssignee(team, { kind: "social", clientId: "c1" }, "2026-11-22")).toBe("amano");
    expect(pickAssignee(team, { kind: "social", clientId: "c2" }, "2026-11-22")).toBe("all");
    expect(pickAssignee(team, { kind: "probleem", clientId: "c1" }, "2026-11-22")).toBeNull();
  });
});
