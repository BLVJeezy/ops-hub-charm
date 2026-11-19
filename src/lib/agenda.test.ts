import { describe, expect, it } from "vitest";
import { clientOf, googleColor, kindOf, perDay, weekOf, type AgendaItem } from "./agenda";

describe("agenda", () => {
  it("tells what a calendar item is from its title", () => {
    expect(kindOf("Werkblok · Villa Amano")).toBe("block");
    expect(kindOf("Pathé – Management (Ladies Night)")).toBe("pathe");
    expect(kindOf("Riory afspraak")).toBe("meeting");
    expect(kindOf("💐 Bloemen dag")).toBe("other");
  });
  it("finds the client in a title", () => {
    const clients = [{ id: "r", name: "Riory BV" }, { id: "v", name: "Villa Amano" }, { id: "d", name: "DynaMik (SRL Energy Life)" }];
    expect(clientOf("📊 Riory — Wekelijks rapport", clients)).toBe("r");
    expect(clientOf("Werkblok · DynaMik", clients)).toBe("d");
    expect(clientOf("Pathé – Management", clients)).toBeNull();
  });
  it("picks the nearest Google Calendar colour", () => {
    expect(googleColor("#F97316")).toBe("6");   // orange → tangerine
    expect(googleColor("#2563EB")).toBe("9");   // blue → blueberry
    expect(googleColor(null)).toBe("8");
  });
  it("lays out a week from Monday", () => {
    expect(weekOf("2026-11-19")).toEqual(["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"]);
    expect(weekOf("2026-11-22", 1)[0]).toBe("2026-11-23");
  });
  it("groups per day and shows a synced booking once", () => {
    const it2 = (id: string, start: string, kind: AgendaItem["kind"], title: string): AgendaItem => ({ id, start, end: start, title, kind, clientId: null, color: "#fff" });
    const g = perDay([it2("b", "2026-11-20T14:00:00Z", "booking", "Ann"), it2("c", "2026-11-20T14:00:00.000Z", "other", "Gesprek: Ann"), it2("w", "2026-11-20T09:00:00Z", "block", "Werkblok · X")], weekOf("2026-11-19"));
    expect(g["2026-11-20"].map((x) => x.id)).toEqual(["w", "b"]);
  });
});
