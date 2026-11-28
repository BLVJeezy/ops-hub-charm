import { describe, expect, it } from "vitest";
import { TEMPLATE, merge, type Row } from "./site-checklist";
import { nextStep, overall, phases } from "./site-process";

function row(key: string, patch: Partial<Row> = {}): Row {
  return {
    key,
    label: null,
    grp: null,
    state: "open",
    note: null,
    auto_state: null,
    auto_detail: null,
    auto_at: null,
    ...patch,
  };
}

describe("site process phases", () => {
  it("marks a phase nvt when all its items are nvt and excludes it from overall total", () => {
    const items = merge([
      row("d-spf", { state: "nvt" }),
      row("d-dmarc", { state: "nvt" }),
    ]);
    const result = phases(items);
    const maildomein = result.find((p) => p.id === "maildomein");
    expect(maildomein?.status).toBe("nvt");
    expect(maildomein?.total).toBe(0);
    expect(maildomein?.done).toBe(0);
    expect(overall(result)).toEqual({ klaar: 0, total: 8, live: false });
  });

  it("marks all phases klaar and live when every item is done", () => {
    const items = merge(TEMPLATE.map((t) => row(t.key, { state: "klaar" })));
    const result = phases(items);
    expect(result.every((p) => p.status === "klaar")).toBe(true);
    expect(overall(result)).toEqual({ klaar: 9, total: 9, live: true });
    expect(nextStep(result)).toBeNull();
  });

  it("marks a phase geblokkeerd when an open item has a non-empty note", () => {
    const items = merge([
      row("s-toegang", { state: "open", note: "klant heeft geen toegang tot DNS" }),
      row("d-domein", { state: "klaar" }),
    ]);
    const domein = phases(items).find((p) => p.id === "domein");
    expect(domein?.status).toBe("geblokkeerd");
    expect(domein?.done).toBe(1);
    expect(domein?.total).toBe(4);
    expect(domein?.blockers).toEqual([
      { label: "Toegang domein/DNS ontvangen", note: "klant heeft geen toegang tot DNS" },
    ]);
    expect(domein?.missing).toEqual([
      "Beveiligd (https, geldig certificaat)",
      "www en zonder www komen op dezelfde site",
    ]);
  });

  it("counts auto_state ok as done even when state is open", () => {
    const items = merge([
      row("d-mail", { state: "open", auto_state: "ok" }),
      row("d-form", { state: "klaar" }),
    ]);
    const email = phases(items).find((p) => p.id === "email");
    expect(email?.status).toBe("klaar");
    expect(email?.done).toBe(2);
    expect(email?.total).toBe(2);
    expect(email?.missing).toEqual([]);
  });

  it("places custom x- items in the phase matching their group", () => {
    const items = merge([
      row("x-1", { label: "Huisstijlgids", grp: "start", state: "open", note: "wacht op klant" }),
      row("x-2", { label: "Blogpagina", grp: "paginas", state: "klaar" }),
      row("x-3", { label: "Subdomein", grp: "domein", state: "open" }),
      row("x-4", { label: "Bing Webmaster", grp: "vindbaarheid", state: "open" }),
      row("x-5", { label: "Handleiding PDF", grp: "overdracht", state: "open" }),
    ]);
    const result = phases(items);
    expect(result.find((p) => p.id === "bestanden")?.blockers).toEqual([
      { label: "Huisstijlgids", note: "wacht op klant" },
    ]);
    expect(result.find((p) => p.id === "website")?.done).toBe(1);
    expect(result.find((p) => p.id === "domein")?.missing).toContain("Subdomein");
    expect(result.find((p) => p.id === "seo")?.missing).toContain("Bing Webmaster");
    expect(result.find((p) => p.id === "oplevering")?.missing).toContain("Handleiding PDF");
  });

  it("returns the first non-klaar, non-nvt phase in order from nextStep", () => {
    const websiteKeys = TEMPLATE.filter((t) => t.group === "paginas").map((t) => t.key);
    const items = merge([
      ...websiteKeys.map((k) => row(k, { state: "klaar" })),
      row("s-bestanden", { state: "nvt" }),
    ]);
    const result = phases(items);
    expect(nextStep(result)?.id).toBe("domein");
  });
});