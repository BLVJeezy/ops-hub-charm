/**
 * The free assistant: answers the common questions from the Hub's own numbers, with no AI model and no costs.
 * It recognises what is asked from a few words, so it handles a fixed set of questions, in Dutch or English.
 */
export type FreeData = {
  invoices: {
    invoice_number: number | null;
    client_name: string | null;
    date: string;
    total: number;
    status: string;
  }[];
  tasks: {
    title: string;
    due_date: string | null;
    assignee: string | null;
    client: string | null;
  }[]; // open tasks only
  expenses: { name: string; monthly_cost: number }[];
  records: { kind: string; site: string | null; created: string }[];
  sites: { name: string; status: string | null }[];
};
export type Intent =
  "revenue" | "open" | "tasks" | "costs" | "leads" | "sites" | "briefing" | "help";
type Lang = "nl" | "en";

export function intent(q: string): Intent {
  const s = q.toLowerCase();
  if (/briefing|overzicht|samenvatting|summary|overview|hoe staan we|how are we/.test(s))
    return "briefing";
  if (
    /(open|openstaand|onbetaald|unpaid|outstanding|te ontvangen)/.test(s) &&
    /(factu|invoice|bedrag|geld|money)/.test(s)
  )
    return "open";
  if (/omzet|revenue|verdiend|earned|gefactureerd|invoiced|turnover/.test(s)) return "revenue";
  if (/taak|taken|task|to.?do|moet ik|should i do|planning|vandaag doen/.test(s)) return "tasks";
  if (/kost|cost|uitgave|expense|abonnement/.test(s)) return "costs";
  if (/lead|aanvra|afspra|reservat|bestelling|request|booking|appointment/.test(s)) return "leads";
  if (/site|website|online|offline|status|down/.test(s)) return "sites";
  return "help";
}
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
/** The period a question is about: "25 dagen", "deze maand", "vorige maand", "dit jaar"; 30 days when it names none. */
export function period(
  q: string,
  today: string,
): { from: string; to: string; nl: string; en: string } {
  const s = q.toLowerCase(),
    n = /(\d+)\s*(dagen|dag|days|day)/.exec(s),
    w = /(\d+)\s*(weken|week|weeks)/.exec(s);
  const [y, m] = today.split("-").map(Number);
  if (/vorige maand|last month|afgelopen maand/.test(s)) {
    const from = iso(new Date(Date.UTC(y, m - 2, 1))),
      to = iso(new Date(Date.UTC(y, m - 1, 0)));
    return { from, to, nl: "vorige maand", en: "last month" };
  }
  if (/deze maand|this month/.test(s))
    return { from: `${today.slice(0, 7)}-01`, to: today, nl: "deze maand", en: "this month" };
  if (/dit jaar|this year/.test(s))
    return { from: `${y}-01-01`, to: today, nl: "dit jaar", en: "this year" };
  if (/vandaag|today/.test(s)) return { from: today, to: today, nl: "vandaag", en: "today" };
  const days = n ? Number(n[1]) : w ? Number(w[1]) * 7 : /week/.test(s) ? 7 : 30;
  return {
    from: addDays(today, -days),
    to: today,
    nl: `de laatste ${days} dagen`,
    en: `the last ${days} days`,
  };
}
const eur = (v: number) => `€${Math.round(v).toLocaleString("nl-BE")}`;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function revenue(q: string, d: FreeData, today: string, l: Lang): string {
  const p = period(q, today),
    inv = d.invoices.filter(
      (i) => i.date >= p.from && i.date <= p.to && (i.status === "Paid" || i.status === "Sent"),
    );
  const total = sum(inv.map((i) => i.total)),
    paid = sum(inv.filter((i) => i.status === "Paid").map((i) => i.total));
  if (!inv.length)
    return l === "nl" ? `Er is ${p.nl} niets gefactureerd.` : `Nothing was invoiced ${p.en}.`;
  return l === "nl"
    ? `De omzet van ${p.nl} is ${eur(total)}, uit ${inv.length} ${inv.length === 1 ? "factuur" : "facturen"}. Daarvan is ${eur(paid)} al betaald.`
    : `Revenue for ${p.en} is ${eur(total)}, from ${inv.length} ${inv.length === 1 ? "invoice" : "invoices"}. Of that, ${eur(paid)} is already paid.`;
}
function open(d: FreeData, l: Lang): string {
  const inv = d.invoices.filter((i) => i.status === "Sent");
  if (!inv.length)
    return l === "nl" ? "Er staan geen facturen open." : "There are no open invoices.";
  const list = inv.map((i) => `${i.client_name ?? "?"} ${eur(i.total)}`).join(", ");
  return l === "nl"
    ? `Er staat ${eur(sum(inv.map((i) => i.total)))} open, in ${inv.length} ${inv.length === 1 ? "factuur" : "facturen"}: ${list}.`
    : `${eur(sum(inv.map((i) => i.total)))} is open, in ${inv.length} ${inv.length === 1 ? "invoice" : "invoices"}: ${list}.`;
}
function tasks(d: FreeData, today: string, l: Lang): string {
  const mine = d.tasks.filter((t) => t.assignee !== "client" && t.due_date && t.due_date <= today);
  const late = mine.filter((t) => (t.due_date as string) < today).length;
  if (!mine.length) return l === "nl" ? "Je hebt vandaag geen taken." : "You have no tasks today.";
  const list = mine
    .slice(0, 6)
    .map((t) => (t.client ? `${t.client}: ${t.title}` : t.title))
    .join(". ");
  const more =
    mine.length > 6
      ? l === "nl"
        ? ` En nog ${mine.length - 6} andere.`
        : ` And ${mine.length - 6} more.`
      : "";
  return l === "nl"
    ? `Je hebt ${mine.length} ${mine.length === 1 ? "taak" : "taken"} voor vandaag${late ? `, waarvan ${late} te laat` : ""}. ${list}.${more}`
    : `You have ${mine.length} ${mine.length === 1 ? "task" : "tasks"} for today${late ? `, ${late} of them late` : ""}. ${list}.${more}`;
}
function costs(d: FreeData, l: Lang): string {
  const total = sum(d.expenses.map((e) => e.monthly_cost)),
    top = [...d.expenses]
      .sort((a, b) => b.monthly_cost - a.monthly_cost)
      .slice(0, 3)
      .map((e) => `${e.name} ${eur(e.monthly_cost)}`)
      .join(", ");
  return l === "nl"
    ? `Je vaste kosten zijn ${eur(total)} per maand. De grootste: ${top}.`
    : `Your fixed costs are ${eur(total)} a month. The biggest: ${top}.`;
}
function leads(q: string, d: FreeData, today: string, l: Lang): string {
  const p = /\d|maand|month|jaar|year|vandaag|today/.test(q.toLowerCase())
    ? period(q, today)
    : period("7 dagen", today);
  const rec = d.records.filter(
    (r) =>
      r.kind !== "blokkade" && r.created.slice(0, 10) >= p.from && r.created.slice(0, 10) <= p.to,
  );
  if (!rec.length)
    return l === "nl"
      ? `Er kwam ${p.nl} niets nieuws binnen via de websites.`
      : `Nothing new came in through the websites ${p.en}.`;
  const by = new Map<string, number>();
  for (const r of rec) by.set(r.site ?? "?", (by.get(r.site ?? "?") ?? 0) + 1);
  const list = [...by.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([s, n]) => `${s} ${n}`)
    .join(", ");
  return l === "nl"
    ? `Er kwamen ${p.nl} ${rec.length} aanvragen en boekingen binnen: ${list}.`
    : `${rec.length} requests and bookings came in ${p.en}: ${list}.`;
}
function sites(d: FreeData, l: Lang): string {
  const down = d.sites.filter((s) => s.status && s.status !== "up");
  if (!down.length)
    return l === "nl"
      ? `Alle ${d.sites.length} websites zijn online.`
      : `All ${d.sites.length} websites are online.`;
  return l === "nl"
    ? `${down.length} van de ${d.sites.length} websites ${down.length === 1 ? "heeft" : "hebben"} een probleem: ${down.map((s) => s.name).join(", ")}.`
    : `${down.length} of ${d.sites.length} websites ${down.length === 1 ? "has" : "have"} a problem: ${down.map((s) => s.name).join(", ")}.`;
}
export const FREE_IDEAS = {
  nl: [
    "Geef me de briefing",
    "Wat was de omzet de laatste 30 dagen?",
    "Wat moet ik vandaag doen?",
    "Welke facturen staan nog open?",
  ],
  en: [
    "Give me the briefing",
    "What was the revenue in the last 30 days?",
    "What should I do today?",
    "Which invoices are still open?",
  ],
};

export function freeAnswer(q: string, d: FreeData, today: string, l: Lang): string {
  switch (intent(q)) {
    case "revenue":
      return revenue(q, d, today, l);
    case "open":
      return open(d, l);
    case "tasks":
      return tasks(d, today, l);
    case "costs":
      return costs(d, l);
    case "leads":
      return leads(q, d, today, l);
    case "sites":
      return sites(d, l);
    case "briefing":
      return [
        sites(d, l),
        revenue("30 dagen", d, today, l),
        open(d, l),
        leads("", d, today, l),
        tasks(d, today, l),
      ].join("\n");
    default:
      return l === "nl"
        ? "Dat kan ik in de gratis versie niet opzoeken. Ik ken: de briefing, omzet over een periode, openstaande facturen, je taken van vandaag, je vaste kosten, nieuwe aanvragen en de status van de websites."
        : "I can't look that up in the free version. I know: the briefing, revenue over a period, open invoices, today's tasks, your fixed costs, new requests and the status of the websites.";
  }
}
