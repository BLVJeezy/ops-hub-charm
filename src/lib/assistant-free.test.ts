import { describe, expect, it } from "vitest";
import { freeAnswer, intent, period, type FreeData } from "./assistant-free";

const d: FreeData = {
  invoices: [
    { invoice_number: 43, client_name: "Riory BV", date: "2026-11-01", total: 500, status: "Paid" },
    {
      invoice_number: 46,
      client_name: "Villa Amano",
      date: "2026-11-15",
      total: 1451.67,
      status: "Paid",
    },
    { invoice_number: 53, client_name: "DynaMik", date: "2026-11-18", total: 150, status: "Sent" },
    {
      invoice_number: 44,
      client_name: "Riory BV",
      date: "2026-12-01",
      total: 500,
      status: "Draft",
    },
    { invoice_number: 40, client_name: "Buckinx", date: "2026-09-26", total: 85, status: "Paid" },
  ],
  tasks: [
    { title: "DNS in orde", due_date: "2026-11-18", assignee: "me", client: "Villa Amano" },
    { title: "Rapport nakijken", due_date: "2026-11-16", assignee: "me", client: "Riory" },
    { title: "Betaling", due_date: "2026-11-18", assignee: "client", client: "DynaMik" },
    { title: "Go-live", due_date: "2026-12-29", assignee: "me", client: "Villa Amano" },
  ],
  expenses: [
    { name: "Claude", monthly_cost: 186.13 },
    { name: "Higgsfield", monthly_cost: 181.89 },
    { name: "Lovable", monthly_cost: 25 },
    { name: "Zoho", monthly_cost: 4.32 },
  ],
  records: [
    { kind: "aanvraag", site: "Riory", created: "2026-11-17T09:00:00Z" },
    { kind: "blokkade", site: "GiGi L", created: "2026-11-17T09:00:00Z" },
    { kind: "lead", site: "Riory", created: "2026-10-01T09:00:00Z" },
  ],
  sites: [
    { name: "Riory", status: "up" },
    { name: "Villa Amano", status: "up" },
  ],
};
const today = "2026-11-18";

describe("free assistant", () => {
  it("recognises what is asked, in Dutch and English", () => {
    expect(intent("yo what was the revenue in the last 25 days")).toBe("revenue");
    expect(intent("Welke facturen staan nog open?")).toBe("open");
    expect(intent("Wat moet ik vandaag doen?")).toBe("tasks");
    expect(intent("hoeveel kosten heb ik")).toBe("costs");
    expect(intent("zijn alle websites online")).toBe("sites");
    expect(intent("geef me de briefing")).toBe("briefing");
    expect(intent("wie is de koning")).toBe("help");
  });
  it("reads the period from the question", () => {
    expect(period("omzet laatste 25 dagen", today)).toMatchObject({
      from: "2026-10-24",
      to: today,
    });
    expect(period("revenue last month", today)).toMatchObject({
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect(period("omzet deze maand", today)).toMatchObject({ from: "2026-11-01", to: today });
    expect(period("omzet", today)).toMatchObject({ from: "2026-10-19" });
  });
  it("adds up revenue without drafts", () => {
    expect(freeAnswer("Wat was de omzet de laatste 30 dagen?", d, today, "nl")).toBe(
      "De omzet van de laatste 30 dagen is €2.102, uit 3 facturen. Daarvan is €1.952 al betaald.",
    );
    expect(freeAnswer("revenue this year", d, today, "en")).toContain("€2.187");
  });
  it("answers open invoices, tasks, costs, leads and sites", () => {
    expect(freeAnswer("welke facturen staan open", d, today, "nl")).toBe(
      "Er staat €150 open, in 1 factuur: DynaMik €150.",
    );
    expect(freeAnswer("wat moet ik vandaag doen", d, today, "nl")).toBe(
      "Je hebt 2 taken voor vandaag, waarvan 1 te laat. Villa Amano: DNS in orde. Riory: Rapport nakijken.",
    );
    expect(freeAnswer("vaste kosten", d, today, "nl")).toContain("€397 per maand");
    expect(freeAnswer("nieuwe aanvragen", d, today, "nl")).toBe(
      "Er kwamen de laatste 7 dagen 1 aanvragen en boekingen binnen: Riory 1.",
    );
    expect(freeAnswer("status websites", d, today, "en")).toBe("All 2 websites are online.");
  });
  it("says what it knows when it does not understand", () => {
    expect(freeAnswer("wie is de koning", d, today, "nl")).toContain("gratis versie");
  });
});
