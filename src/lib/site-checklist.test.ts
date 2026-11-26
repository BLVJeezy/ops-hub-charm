import { describe, expect, it } from "vitest";
import { TEMPLATE, isDone, merge, progress } from "./site-checklist";

describe("site checklist", () => {
  it("has the pages the owner asked for", () => {
    const labels = TEMPLATE.map((t) => t.label).join(" | ");
    for (const w of ["Hoofdpagina", "FAQ", "Privacybeleid", "Algemene voorwaarden", "Domeinnaam", "E-mailadres"]) expect(labels).toContain(w);
  });
  it("counts ticked and automatically found items, and leaves n.v.t. out", () => {
    const v = merge([
      { key: "p-home", label: null, grp: null, state: "klaar", note: null, auto_state: null, auto_detail: null, auto_at: null },
      { key: "p-faq", label: null, grp: null, state: "open", note: null, auto_state: "ok", auto_detail: "/faq", auto_at: null },
      { key: "p-404", label: null, grp: null, state: "nvt", note: null, auto_state: null, auto_detail: null, auto_at: null },
      { key: "x-1", label: "Logo in hoge resolutie", grp: "overdracht", state: "open", note: null, auto_state: null, auto_detail: null, auto_at: null },
    ]);
    expect(v.find((x) => x.key === "x-1")?.custom).toBe(true);
    const p = progress(v);
    expect(p.total).toBe(TEMPLATE.length); // one n.v.t. out, one extra in
    expect(p.done).toBe(2);
    expect(isDone({ state: "open", auto_state: "mis" })).toBe(false);
  });
});
