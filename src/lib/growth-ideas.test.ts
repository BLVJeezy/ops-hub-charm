import { describe, expect, it } from "vitest";
import { actionsFor, consentLine, isOpen, pileOf } from "./growth-ideas";

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
  it("sorts every idea into one clear pile", () => {
    expect(pileOf({ status: "voorgesteld", task_id: null })).toBe("nieuw");
    expect(pileOf({ status: "live", task_id: null })).toBe("gebruikt");
    expect(pileOf({ status: "overgeslagen", task_id: "t" })).toBe("gebruikt");
    expect(pileOf({ status: "overgeslagen", task_id: null })).toBe("afgekeurd");
    expect(pileOf({ status: "teruggezet", task_id: null })).toBe("afgekeurd");
    expect(pileOf({ status: "aanpassen", task_id: null })).toBe("bezig");
  });
  it("lets you change course after Deploy and after going live", () => {
    expect(actionsFor({ status: "ingepland", kind: "code" })).toMatchObject({ editQueued: true, unqueue: true });
    expect(actionsFor({ status: "ter_controle", kind: "code" })).toMatchObject({ revise: true, review: true });
    expect(actionsFor({ status: "live", kind: "code" }).rollback).toBe(true);
  });
});
