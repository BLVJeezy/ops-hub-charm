import { describe, expect, it } from "vitest";
import { actionsFor, consentLine, isOpen } from "./growth-ideas";

describe("growth ideas", () => {
  it("only offers Deploy on a fresh code idea", () => {
    expect(actionsFor({ status: "voorgesteld", kind: "code" }).deploy).toBe(true);
    expect(actionsFor({ status: "voorgesteld", kind: "tip" }).deploy).toBe(false);
    expect(actionsFor({ status: "ter_controle", kind: "code" })).toMatchObject({ deploy: false, review: true });
  });
  it("says who allowed it, for which repo, and that it does not go live on its own", () => {
    const l = consentLine("Jason", new Date("2026-11-22T15:00:00Z"), { name: "Riory", repo: "BLVJeezy/riory" });
    expect(l).toContain("Jason");
    expect(l).toContain("BLVJeezy/riory");
    expect(l).toContain("Niet live zetten");
  });
  it("knows what is finished", () => {
    expect(isOpen("ter_controle")).toBe(true);
    expect(isOpen("live")).toBe(false);
  });
});
