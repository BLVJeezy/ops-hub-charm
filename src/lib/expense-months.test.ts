import { describe, expect, it } from "vitest";
import { costLines, lastMonths, monthTotal, passedOn, vendor } from "./expense-months";

describe("expense months", () => {
  it("names vendors from bank descriptions", () => {
    expect(vendor("Link.com* Higgsfield I")).toBe("Higgsfield");
    expect(vendor("Anthropic* Claude Sub")).toBe("Claude / Anthropic");
    expect(vendor("Openai* Chatgpt Credit")).toBe("ChatGPT / OpenAI");
    expect(vendor("Wix.com 123456789")).toBe("Wix.com");
  });
  it("lists the last months, oldest first, across a year end", () => {
    expect(lastMonths("2026-02", 4)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
  it("adds costs per vendor per month and leaves out income and the owner's own transfers", () => {
    const lines = costLines([
      { date: "2026-10-03", amount: -7.56, description: "Link.com* Higgsfield I", account: "Software & tools" },
      { date: "2026-10-22", amount: -14.23, description: "Link.com* Higgsfield I", account: "Software & tools" },
      { date: "2026-09-01", amount: -9.18, description: "Higgsfield Inc.", account: "Software & tools" },
      { date: "2026-10-07", amount: -300, description: "To Jason Balongo • Liquid cash", account: "Rekening-courant zaakvoerder" },
      { date: "2026-10-06", amount: 500, description: "Money added from RIORY", account: "Omzet" },
      { date: "2026-10-12", amount: -40, description: "Shell 7684 Tongeren", account: "Auto, transport & reizen" },
      { date: "2025-01-01", amount: -99, description: "Lovable", account: "Software & tools" },
    ], ["2026-09", "2026-10"]);
    expect(lines.map((l) => [l.name, l.total])).toEqual([["Auto, transport & reizen", 40], ["Higgsfield", 30.97]]);
    expect(lines[1].months).toEqual({ "2026-09": 9.18, "2026-10": 21.79 });
    expect(monthTotal(lines, "2026-10")).toBe(61.79);
  });
});

describe("pass-through", () => {
  it("keeps money passed on to Les Autres out of the costs and lists it apart", () => {
    const txs = [
      { date: "2026-10-10", amount: -380.16, description: "To Muhammad Masae • Solyn Global - Les Autres", account: "Freelancers & onderaanneming" },
      { date: "2026-10-12", amount: -25, description: "Lovable", account: "Software & tools" },
    ];
    expect(costLines(txs, ["2026-10"]).map((l) => l.name)).toEqual(["Lovable"]);
    expect(passedOn(txs, "2026-10")).toEqual([{ client: "Les Autres", amount: 380.16 }]);
  });
});
