import { describe, expect, it } from "vitest";
import { diffContent, flagsFor, summary } from "./site-changes";

describe("site changes", () => {
  it("lists what changed, with before and after", () => {
    const c = diffContent(
      { text: { Welkom: "Welkom bij ons" } },
      { text: { Welkom: "Hallo", "Open op maandag": "Open op dinsdag" } },
    );
    expect(c.map((x) => [x.key, x.before, x.after])).toEqual([
      ["Welkom", "Welkom bij ons", "Hallo"],
      ["Open op maandag", "Open op maandag", "Open op dinsdag"],
    ]);
  });
  it("sees a field set back to the original as a change, and an unchanged one as none", () => {
    expect(diffContent({ text: { A: "B" } }, { text: {} })).toMatchObject([
      { key: "A", before: "B", after: "A" },
    ]);
    expect(diffContent({ text: { A: "B" } }, { text: { A: "B" } })).toEqual([]);
  });
  it("uses the page and element when the beheerpagina sends them, and flags SEO elements", () => {
    const [c] = diffContent(
      null,
      { text: { "Loodgieter Tongeren": "Loodgieter" } },
      { "Loodgieter Tongeren": { page: "/", tag: "h1" } },
    );
    expect(c).toMatchObject({ page: "/", tag: "h1", seo: true });
    expect(flagsFor([c])).toEqual(["seo"]);
  });
  it("flags lots of text removed, and contact details", () => {
    const long = "Wij zijn al twintig jaar uw loodgieter in Tongeren en omstreken, dag en nacht.";
    const c = diffContent(
      { contact: { tel: { t: "phone", f: "Telefoon", v: "011 11 11 11" } } },
      {
        text: { [long]: "Loodgieter." },
        contact: { tel: { t: "phone", f: "Telefoon", v: "011 22 22 22" } },
      },
    );
    expect(c.find((x) => x.kind === "contact")).toMatchObject({
      key: "Telefoon",
      before: "011 11 11 11",
      after: "011 22 22 22",
      seo: true,
    });
    expect(flagsFor(c).sort()).toEqual(["contact", "removed"]);
  });
  it("flags too much at once or in a day", () => {
    const many = diffContent(null, {
      text: Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`t${i}`, `x${i}`])),
    });
    expect(flagsFor(many)).toContain("many-at-once");
    const one = diffContent(null, { text: { a: "b" } });
    expect(flagsFor(one, { fields: 60, publishes: 1 })).toContain("many-today");
    expect(flagsFor(one, { fields: 2, publishes: 6 })).toContain("many-today");
    expect(flagsFor(one, { fields: 2, publishes: 1 })).toEqual([]);
    expect(summary("Riory", one, [])).toBe("Riory: 1 aanpassing");
  });
});
