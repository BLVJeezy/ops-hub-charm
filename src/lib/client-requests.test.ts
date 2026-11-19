import { describe, expect, it } from "vitest";
import {
  answerBy,
  answerWithin,
  autoPriority,
  byPriority,
  checkRequest,
  estimate,
  PAGE_RATE,
  requestLink,
  slugOf,
  type RequestRow,
} from "./client-requests";

describe("client requests", () => {
  it("prices new pages at the €85 minimum per page", () => {
    expect(PAGE_RATE).toBe(85);
    expect(estimate("nieuwe-pagina", 1)).toBe(85);
    expect(estimate("nieuwe-pagina", 3)).toBe(255);
    expect(estimate("nieuwe-pagina", null)).toBe(85);
    expect(estimate("wijziging", 3)).toBeNull();
  });
  it("checks what a client sends", () => {
    const ok = {
      title: "Nieuwe foto's op home",
      kind: "wijziging" as const,
      urgency: "normaal" as const,
    };
    expect(checkRequest(ok, "2026-11-19")).toBeNull();
    expect(checkRequest({ ...ok, title: "x" }, "2026-11-19")).toMatch(/titel/);
    expect(checkRequest({ ...ok, urgency: "dringend" }, "2026-11-19")).toBeNull();
    expect(checkRequest({ ...ok, kind: "nieuwe-pagina", pages: 0 }, "2026-11-19")).toMatch(
      /pagina/,
    );
    expect(checkRequest({ ...ok, wished_date: "2026-11-01" }, "2026-11-19")).toMatch(/verleden/);
    expect(checkRequest({ ...ok, contact_email: "nope" }, "2026-11-19")).toMatch(/e-mail/);
    // @ts-expect-error unknown kind
    expect(checkRequest({ ...ok, kind: "hack" }, "2026-11-19")).toMatch(/Kies/);
  });
  it("sorts: open first, my priority over their urgency, then nearest date, then oldest", () => {
    const r = (id: string, o: Partial<RequestRow>): RequestRow => ({
      id,
      status: "nieuw",
      priority: null,
      urgency: "normaal",
      wished_date: null,
      created_at: "2026-11-10",
      ...o,
    });
    const list = byPriority([
      r("done", { status: "klaar", priority: 1 }),
      r("later", { priority: 4, urgency: "dringend" }),
      r("urgent", { urgency: "dringend" }),
      r("mine1", { priority: 1 }),
      r("dated", { wished_date: "2026-11-25" }),
      r("plain", { created_at: "2026-11-01" }),
    ]);
    expect(list.map((x) => x.id)).toEqual(["mine1", "urgent", "dated", "plain", "later", "done"]);
  });
  it("puts what does not work first, and no longer asks the client for urgency", () => {
    expect(autoPriority("probleem")).toBe(1);
    expect(autoPriority("wijziging")).toBeNull();
    expect(checkRequest({ title: "Formulier stuk", kind: "probleem" }, "2026-11-19")).toBeNull();
  });
  it("builds the client link on the company website", () => {
    expect(slugOf("Villa Amano")).toBe("villa-amano");
    expect(slugOf("DynaMik (SRL Energy Life)")).toBe("dynamik");
    expect(slugOf("GiGi L Coiffure")).toBe("gigi-l-coiffure");
    expect(slugOf("Café Ré & Zo")).toBe("cafe-re-en-zo");
    expect(requestLink("ab12", "Riory BV")).toBe("https://solynglobal.be/client/riory-bv#ab12");
  });
  it("promises an answer: urgent within 24h, general questions within 48–72h", () => {
    expect(answerWithin("andere", "normaal")?.label).toBe("binnen 48 à 72 uur");
    expect(answerWithin("wijziging", "dringend")?.hours).toBe(24);
    expect(answerWithin("andere", "dringend")?.hours).toBe(24);
    expect(answerWithin("wijziging", "normaal")).toBeNull();
    expect(answerWithin("probleem")?.hours).toBe(24);
    expect(
      answerBy({ kind: "andere", urgency: "laag", created_at: "2026-11-19T10:00:00.000Z" }),
    ).toBe("2026-11-22T10:00:00.000Z");
  });
});
