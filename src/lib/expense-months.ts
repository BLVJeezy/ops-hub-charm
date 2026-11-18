/** What each cost came to per month, from the bank transactions in the bookkeeping. */
export type CostTx = { date: string; amount: number; description: string; account: string | null };
export type CostLine = { name: string; group: string; months: Record<string, number>; total: number };

/** Ledger accounts that are not costs of the business: the owner's current account and currency moves. */
const NOT_COSTS = [/rekening-courant/i, /vreemde valuta/i];
const VENDORS: [RegExp, string][] = [
  [/higgsfield/i, "Higgsfield"], [/anthropic|claude/i, "Claude / Anthropic"], [/openai|chatgpt/i, "ChatGPT / OpenAI"],
  [/leadsnap/i, "LeadSnap"], [/lovable/i, "Lovable"], [/resend/i, "Resend"], [/cookieyes/i, "CookieYes"], [/base44/i, "Base44"],
  [/zoho/i, "Zoho"], [/canva/i, "Canva"], [/google/i, "Google Workspace"], [/github/i, "GitHub"], [/supabase/i, "Supabase"],
  [/instantly/i, "Instantly"], [/ionos/i, "IONOS"], [/godaddy/i, "GoDaddy"], [/calendly/i, "Calendly"], [/artlist/i, "Artlist"],
  [/shopify/i, "Shopify"], [/zoom\.com/i, "Zoom"], [/zadarma/i, "Zadarma"], [/gamma/i, "Gamma"], [/myclaw/i, "MyClaw"],
  [/wetracked/i, "WeTracked"], [/x developer/i, "X Developer"], [/flowagent/i, "FlowAgent"], [/dodopay|clickcast/i, "Clickcast"],
  [/revolut/i, "Revolut Business"], [/facebk|facebook|meta/i, "Facebook-advertenties"], [/muhammad masae/i, "Muhammad Masae (freelancer)"],
];
export function vendor(description: string): string {
  for (const [re, name] of VENDORS) if (re.test(description)) return name;
  const clean = description.replace(/^to\s+/i, "").split(/[*•#]/)[0].replace(/\d{3,}.*$/, "").trim();
  return clean || description;
}
export const monthKey = (iso: string) => iso.slice(0, 7);
/** The last `count` months up to and including `upTo` (YYYY-MM), oldest first. */
export function lastMonths(upTo: string, count: number): string[] {
  const [y, m] = upTo.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => { const d = new Date(Date.UTC(y, m - 1 - (count - 1 - i), 1)); return d.toISOString().slice(0, 7); });
}
/** One line per vendor (software and tools, bank costs, ads, freelancers) or per ledger account for the rest, biggest first. */
export function costLines(txs: CostTx[], months: string[]): CostLine[] {
  const keep = new Set(months), map = new Map<string, CostLine>();
  for (const t of txs) {
    if (t.amount >= 0 || !keep.has(monthKey(t.date)) || NOT_COSTS.some((re) => re.test(t.account ?? ""))) continue;
    const group = t.account ?? "Niet ingedeeld";
    const byVendor = /software|bank|marketing|freelanc/i.test(group);
    const name = byVendor ? vendor(t.description) : group;
    const key = `${group}|${name}`, line = map.get(key) ?? { name, group, months: {}, total: 0 };
    const m = monthKey(t.date), v = -t.amount;
    line.months[m] = Math.round(((line.months[m] ?? 0) + v) * 100) / 100;
    line.total = Math.round((line.total + v) * 100) / 100;
    map.set(key, line);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}
export const monthTotal = (lines: CostLine[], m: string) => Math.round(lines.reduce((s, l) => s + (l.months[m] ?? 0), 0) * 100) / 100;
