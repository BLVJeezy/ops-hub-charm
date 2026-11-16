// data.json (Hub snapshot, see snapshot.sql) → plan.json: every number the film shows, computed with the Hub's own fee and forecast code,
// plus the look of this edition (seeded by the day, so no two films look alike) and the voice lines.
// Usage: node --experimental-strip-types tools/prepare.mts <project dir> [full|week]
import fs from "node:fs";
import path from "node:path";
import { clientMRR, clientMRRBreakdown } from "../../src/lib/fees.ts";
import { forecastByService, lineService } from "../../src/lib/invoice-schedule.ts";

const P = path.resolve(process.argv[2] || ".");
const S = JSON.parse(fs.readFileSync(path.join(P, "data.json"), "utf8"));
const mode: "full" | "week" = process.argv[3] === "full" || process.argv[3] === "week" ? process.argv[3] : (S.mode ?? "week");
const day: string = S.day;
const r0 = (n: number) => Math.round(n);
const addDays = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monLabel = (ym: string) => MONTHS[Number(ym.slice(5, 7)) - 1].slice(0, 3);
const short = (name: string) => name.replace(/\s*\(.*\)$/, "").replace(/\s+(BV|BVBA|NV|SRL|Ltd)$/i, "");
// numbers as words, so the voice never reads digits oddly
const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
function words(n: number): string {
  n = Math.round(Math.abs(n));
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? "-" + ONES[n % 10] : "");
  if (n < 1000) return ONES[Math.floor(n / 100)] + " hundred" + (n % 100 ? " and " + words(n % 100) : "");
  if (n < 1e6) return words(Math.floor(n / 1000)) + " thousand" + (n % 1000 ? (n % 1000 < 100 ? " and " : " ") + words(n % 1000) : "");
  return String(n);
}
// spoken money: exact under a thousand, rounded to the hundred above it (the exact figure is on screen)
const euroWords = (n: number) => (n < 1000 ? `${words(n)} euros` : `${n % 100 >= 0.5 && Math.round(n) % 100 ? "about " : ""}${words(Math.round(n / 100) * 100)} euros`);
const list = (a: string[]) => (a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]);
const euro = (n: number) => "€" + r0(n).toLocaleString("en-US");
const plural = (n: number, one: string, many = one + "s") => `${words(n)} ${n === 1 ? one : many}`;

// ── customers ──
const clients = S.clients as any[];
const active = clients.filter((c) => c.status === "Active");
const FALLBACK = ["#38BDF8", "#F472B6", "#34D399", "#FBBF24", "#A78BFA", "#FB7185"];
const mrrRows = active.map((c, i) => ({ id: c.id, name: short(c.name), color: c.brand_color || FALLBACK[i % FALLBACK.length], mrr: clientMRR(c), ...clientMRRBreakdown(c), created: c.created }))
  .sort((a, b) => b.mrr - a.mrr || a.name.localeCompare(b.name));
const mrr = mrrRows.reduce((a, r) => a + r.mrr, 0);
const services = { seo: mrrRows.reduce((a, r) => a + r.seo, 0), website: mrrRows.reduce((a, r) => a + r.website, 0), social: mrrRows.reduce((a, r) => a + r.social, 0) };
const noRecurring = mrrRows.filter((r) => r.mrr === 0).map((r) => r.name);
const newClients = (since: string) => active.filter((c) => c.created >= since).map((c) => ({ name: short(c.name), mrr: clientMRR(c) }));

// ── money ──
const invoices = S.invoices as any[];
const paid = invoices.filter((v) => v.status === "Paid");
const paidTotal = paid.reduce((a, v) => a + Number(v.total || 0), 0);
const firstDay: string = paid.length ? paid[0].date : day;
const months: string[] = [];
for (let y = Number(firstDay.slice(0, 4)), m = Number(firstDay.slice(5, 7)); `${y}-${String(m).padStart(2, "0")}` <= day.slice(0, 7); m === 12 ? (y++, m = 1) : m++) months.push(`${y}-${String(m).padStart(2, "0")}`);
const byMonth = months.map((ym) => ({ month: ym, label: monLabel(ym), total: paid.filter((v) => v.date.slice(0, 7) === ym).reduce((a, v) => a + Number(v.total || 0), 0) }));
let run = 0;
const cumulative = byMonth.map((b) => ({ ...b, run: (run += b.total) }));
const paidByService = { seo: 0, website: 0, social: 0, oneoff: 0 } as Record<string, number>;
for (const v of paid) for (const l of v.line_items ?? []) paidByService[lineService(l.description ?? "")] += Number(l.qty ?? 1) * Number(l.unit_price ?? l.price ?? 0);
const paidByClient = Object.entries(paid.reduce((a: Record<string, number>, v) => { a[v.client_name] = (a[v.client_name] ?? 0) + Number(v.total || 0); return a; }, {}))
  .map(([name, total]) => ({ name: short(name), total, color: clients.find((c) => c.name === name)?.brand_color || "#8A93A6" })).sort((a, b) => b.total - a.total);
const open = invoices.filter((v) => v.status === "Sent");
const openTotal = open.reduce((a, v) => a + Number(v.total || 0), 0);
const costs = (S.expenses as any[]).reduce((a, e) => a + Number(e.monthly || 0), 0);
const forecast = forecastByService(invoices, day, 6).map((f) => ({ ...f, label: monLabel(f.month) }));
const forecastTotal = forecast.reduce((a, f) => a + f.total, 0);
const weekAgo = addDays(day, -7), twoWeeksAgo = addDays(day, -14), monthAgo = addDays(day, -30);
const paidWeek = paid.filter((v) => v.date > weekAgo && v.date <= day).reduce((a, v) => a + Number(v.total || 0), 0);
const paidPrevWeek = paid.filter((v) => v.date > twoWeeksAgo && v.date <= weekAgo).reduce((a, v) => a + Number(v.total || 0), 0);
const dueSoon = invoices.filter((v) => v.status === "Draft" && v.scheduled_send_at && v.scheduled_send_at >= day && v.scheduled_send_at <= addDays(day, 7))
  .map((v) => ({ name: short(v.client_name), total: Number(v.total || 0), date: v.scheduled_send_at }));

// ── reach ──
const sites = S.sites as any[];
const up = sites.filter((s) => s.status !== "down").length;
const fullWeeks = (S.visits_weekly as any[]).filter((w) => addDays(w.week, 6) < day);   // only finished weeks
const visitors = fullWeeks.map((w) => ({ label: `${Number(w.week.slice(8, 10))} ${monLabel(w.week.slice(0, 7))}`, v: Number(w.visitors) }));
const visitors30 = (S.visits_site_30d as any[]).reduce((a, s) => a + Number(s.visitors), 0);
const topSites = (S.visits_site_30d as any[]).filter((s) => s.visitors > 0).slice(0, 5).map((s) => ({ name: s.name, v: Number(s.visitors), color: clients.find((c) => c.id === s.client_id)?.brand_color || "#8A93A6" }));
const weeks = [...new Set((S.records_weekly as any[]).map((r) => r.week))].sort().filter((w) => addDays(w, 6) < day);
const requests = weeks.map((w) => ({ label: `${Number(w.slice(8, 10))} ${monLabel(w.slice(0, 7))}`, v: (S.records_weekly as any[]).filter((r) => r.week === w).reduce((a, r) => a + Number(r.n), 0) }));
const requestsTotal = Object.values(S.records_total as Record<string, number>).reduce((a, n) => a + Number(n), 0);
const last = <T,>(a: T[], k = 1) => a[a.length - k];
const vNow = last(visitors)?.v ?? 0, vPrev = last(visitors, 2)?.v ?? 0, rNow = last(requests)?.v ?? 0, rPrev = last(requests, 2)?.v ?? 0;
const pct = (now: number, prev: number) => (prev ? Math.round(((now - prev) / prev) * 100) : null);

// ── points that need attention ──
const focus: { title: string; text: string }[] = [];
const top = mrrRows[0];
if (top && mrr && top.mrr / mrr >= 0.35) focus.push({ title: `${r0((top.mrr / mrr) * 100)}% of recurring revenue is ${top.name}`, text: "Spread the risk: grow the other accounts" });
if (noRecurring.length) focus.push({ title: `${noRecurring.length} active ${noRecurring.length === 1 ? "client" : "clients"} without a monthly fee`, text: noRecurring.join(" · ") });
if (openTotal > 0) focus.push({ title: `${euro(openTotal)} invoiced and not yet paid`, text: `${open.length} open ${open.length === 1 ? "invoice" : "invoices"}` });
if (S.tasks.overdue > 0) focus.push({ title: `${S.tasks.overdue} overdue ${S.tasks.overdue === 1 ? "task" : "tasks"}`, text: "Clear them or move the date" });
if (S.incidents.open > 0) focus.push({ title: `${S.incidents.open} open ${S.incidents.open === 1 ? "incident" : "incidents"}`, text: "See the Status page" });
if (up < sites.length) focus.push({ title: `${sites.length - up} of ${sites.length} sites offline`, text: "Check the Status page now" });
if (mrr > 0 && costs / mrr > 0.3) focus.push({ title: `Tools cost ${r0((costs / mrr) * 100)}% of recurring revenue`, text: "Review the subscriptions" });
if (!focus.length) focus.push({ title: "Nothing urgent", text: "Use the week for new business" });

// ── the look of this edition ──
function seeded(seed: string) { let h = 2166136261; for (const ch of seed) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; }; }
const rnd = seeded(day + mode);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const THEMES = ["vault", "ledger", "aurora", "terminal", "studio"];
// consecutive editions never share a theme: the week number walks through the list, the seed only sets the starting point
const weekNo = Math.floor(new Date(day + "T12:00:00Z").getTime() / (7 * 864e5));
const look = {
  theme: S.theme ?? THEMES[(weekNo + (mode === "full" ? 0 : 2)) % THEMES.length],
  transition: pick(["wipe", "push", "iris", "blinds"]),
  revenue: pick(["area", "steps", "bars"]),
  clients: pick(["bars", "lollipop", "bubbles"]),
  services: pick(["donut", "split", "stack"]),
  reach: pick(["area", "bars"]),
  forecast: pick(["stack", "ribbons"]),
  key: Math.floor(rnd() * 5), bpm: pick([92, 100, 108, 116]),
};

// ── scenes and voice ──
const sinceLabel = `${MONTHS[Number(firstDay.slice(5, 7)) - 1]} ${firstDay.slice(0, 4)}`;
const dateLabel = `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]} ${day.slice(0, 4)}`;
const best = [...byMonth].sort((a, b) => b.total - a.total)[0];
const fresh = newClients(mode === "full" ? monthAgo : weekAgo);
const topService = (Object.entries(services) as [string, number][]).sort((a, b) => b[1] - a[1])[0];
const SERVICE_NAME: Record<string, string> = { seo: "S E O", website: "websites", social: "social media" };
const trend = (now: number, prev: number, what: string) => { const p = pct(now, prev); return p === null ? "" : p === 0 ? ` ${what} level with the week before.` : ` ${what} ${p > 0 ? "up" : "down"} ${words(Math.abs(p))} percent.`; };

type Scene = { id: string; type: string; chapter: string; kicker: string; title: string; vo: string; sub: string; min?: number };
const scenes: Scene[] = [];
const add = (s: Scene) => scenes.push(s);
if (mode === "full") {
  add({ id: "open", type: "title", chapter: "Company check", kicker: `Company check · ${dateLabel}`, title: "Solyn Global, from the first invoice to today",
    vo: "Solyn Global. The full company check.", sub: `Solyn Global · full company check · since ${sinceLabel}` });
  add({ id: "revenue", type: "revenue", chapter: "Revenue", kicker: `Paid since ${sinceLabel}`, title: "Revenue received",
    vo: `${euroWords(paidTotal)} received since ${MONTHS[Number(firstDay.slice(5, 7)) - 1]}. ${MONTHS[Number(best.month.slice(5, 7)) - 1]} was the best month.`, sub: `${euro(paidTotal)} received · best month ${best.label}: ${euro(best.total)}` });
  add({ id: "clients", type: "clients", chapter: "Clients", kicker: `${active.length} active clients`, title: "Recurring revenue per client",
    vo: `${plural(active.length, "active client")}, ${euroWords(mrr)} a month. ${top.name} leads.${fresh.length ? ` New: ${list(fresh.map((f) => f.name))}.` : ""}`,
    sub: `${euro(mrr)} per month from ${active.length} clients${fresh.length ? ` · new: ${fresh.map((f) => f.name).join(", ")}` : ""}` });
  add({ id: "services", type: "services", chapter: "Services", kicker: "What earns what", title: "Recurring revenue per service",
    vo: `${list((Object.entries(services) as [string, number][]).sort((a, b) => b[1] - a[1]).map(([k, v], i) => (i ? `${SERVICE_NAME[k]} ${words(v)}` : `${SERVICE_NAME[k]} earns ${euroWords(v)}`)))}.`, sub: `SEO ${euro(services.seo)} · Websites ${euro(services.website)} · Social media ${euro(services.social)}` });
  add({ id: "margin", type: "margin", chapter: "Margin", kicker: "Per month", title: "What is left after tools",
    vo: `Tools cost ${euroWords(costs)}. That leaves ${euroWords(mrr - costs)} a month.`, sub: `${euro(mrr)} in · ${euro(costs)} out · ${euro(mrr - costs)} left` });
  add({ id: "reach", type: "reach", chapter: "Reach", kicker: `${up} of ${sites.length} sites online`, title: "What the client sites deliver",
    vo: `${up === sites.length ? `All ${words(sites.length)} sites are online` : `${words(up)} of ${words(sites.length)} sites are online`}, with ${plural(visitors30, "visitor")} in thirty days.`,
    sub: `${visitors30.toLocaleString("en-US")} visitors in 30 days · ${requestsTotal} requests and bookings in total` });
  add({ id: "forecast", type: "forecast", chapter: "Forecast", kicker: "Planned invoices", title: "The next six months",
    vo: `${euroWords(forecastTotal)} is already planned for the next six months.`, sub: `${euro(forecastTotal)} planned up to ${last(forecast).label}` });
} else {
  add({ id: "open", type: "title", chapter: "This week", kicker: `Weekly progress · ${dateLabel}`, title: "Solyn Global, the week in numbers",
    vo: "Solyn Global. The week in numbers.", sub: `Solyn Global · weekly progress · ${dateLabel}` });
  add({ id: "revenue", type: "week", chapter: "Money in", kicker: "Last 7 days", title: "Money in this week",
    vo: `${paidWeek ? `${euroWords(paidWeek)} came in this week` : "No payments came in this week"}${paidPrevWeek ? `, against ${euroWords(paidPrevWeek)} the week before` : ""}. The total since ${MONTHS[Number(firstDay.slice(5, 7)) - 1]}: ${euroWords(paidTotal)}.`,
    sub: `${euro(paidWeek)} received this week · ${euro(paidTotal)} since ${sinceLabel}` });
  add({ id: "clients", type: "clients", chapter: "Clients", kicker: `${active.length} active clients`, title: "Recurring revenue per client",
    vo: `${plural(active.length, "active client")}, ${euroWords(mrr)} a month.${fresh.length ? ` New this week: ${list(fresh.map((f) => f.name))}.` : " No new clients this week."}`,
    sub: `${euro(mrr)} per month${fresh.length ? ` · new: ${fresh.map((f) => f.name).join(", ")}` : ""}` });
  add({ id: "services", type: "services", chapter: "Services", kicker: "What earns what", title: "Recurring revenue per service",
    vo: `${SERVICE_NAME[topService[0]]} is the largest service, at ${euroWords(topService[1])} a month.`, sub: `SEO ${euro(services.seo)} · Websites ${euro(services.website)} · Social media ${euro(services.social)}` });
  add({ id: "reach", type: "reach", chapter: "Reach", kicker: `${up} of ${sites.length} sites online`, title: "Visitors and requests",
    vo: `${plural(vNow, "visitor")} last week.${trend(vNow, vPrev, "That is")} ${plural(rNow, "request")} came in.`.replace(/\s+/g, " "),
    sub: `${vNow} visitors last week · ${rNow} requests and bookings` });
  add({ id: "forecast", type: "forecast", chapter: "Ahead", kicker: "Planned invoices", title: "What is coming",
    vo: `${dueSoon.length ? `${plural(dueSoon.length, "invoice")} go out this week, worth ${euroWords(dueSoon.reduce((a, d) => a + d.total, 0))}.` : "No invoices go out this week."} ${euroWords(forecastTotal)} is planned for six months.`,
    sub: `${dueSoon.length} ${dueSoon.length === 1 ? "invoice" : "invoices"} this week · ${euro(forecastTotal)} planned in 6 months` });
}
const say = (s: string) => s.replace(/€([\d,]+)/g, (_, n) => euroWords(Number(n.replace(/,/g, "")))).replace(/(\d+)%/g, (_, n) => `${words(Number(n))} percent`).replace(/\b(\d+)\b/g, (_, n) => words(Number(n)));
add({ id: "focus", type: "focus", chapter: "Focus", kicker: "Needs attention", title: focus.length > 1 ? "Points to act on" : "The point to act on",
  vo: `${focus.length > 1 ? `${words(Math.min(3, focus.length))} points` : "One point"}: ${list(focus.slice(0, 3).map((f) => say(f.title).replace(/^./, (ch) => ch.toLowerCase())))}.`,
  sub: focus.slice(0, 3).map((f) => f.title).join(" · "), min: 5 });
add({ id: "end", type: "end", chapter: "End", kicker: dateLabel, title: mode === "full" ? "That is Solyn Global today" : "That was the week",
  vo: "Next progress film: Monday.", sub: mode === "full" ? "Weekly progress film: every Monday" : "Next check: Monday" });

const plan = {
  mode, day, dateLabel, sinceLabel, look, scenes,
  n: { paidTotal, mrr, costs, margin: mrr - costs, openTotal, forecastTotal, active: active.length, sites: sites.length, up, visitors30, requestsTotal, paidWeek, paidPrevWeek, vNow, vPrev, rNow, rPrev },
  byMonth, cumulative, paidByClient, paidByService, mrrRows, services, forecast, visitors, requests, topSites, focus: focus.slice(0, 3), dueSoon,
  sitesList: sites.map((s) => ({ name: s.name, up: s.status !== "down", ms: s.ms })),
};
for (const s of scenes) s.vo = s.vo.trim().replace(/^./, (ch) => ch.toUpperCase()).replace(/(\. )([a-z])/g, (_, a, b) => a + b.toUpperCase());
fs.writeFileSync(path.join(P, "plan.json"), JSON.stringify(plan, null, 1));
fs.writeFileSync(path.join(P, "lines.json"), JSON.stringify(scenes.map((s) => ({ id: s.id, text: s.vo, voice: look.theme === "ledger" || look.theme === "studio" ? "bf_emma" : "bm_george", speed: 1.04 })), null, 1));
console.log(mode, look.theme, scenes.length, "scenes |", euro(paidTotal), "paid |", euro(mrr), "MRR |", euro(forecastTotal), "planned");
