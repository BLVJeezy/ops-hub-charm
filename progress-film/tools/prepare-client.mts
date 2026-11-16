// data.json (client-snapshot.sql) → plan.json for a client's monthly report film. Dutch on screen, no voice: the client reads it.
// Scenes without data are left out, so a social-only client gets a film about videos and a website client one about visitors.
// Usage: node --experimental-strip-types tools/prepare-client.mts <project dir>
import fs from "node:fs";
import path from "node:path";

const P = path.resolve(process.argv[2] || ".");
const S = JSON.parse(fs.readFileSync(path.join(P, "data.json"), "utf8"));
const MON = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const MONTHS = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
const from: string = S.from, to: string = S.to;
const dd = (iso: string) => Number(iso.slice(8, 10)), mm = (iso: string) => Number(iso.slice(5, 7)) - 1;
const days = Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1;
const lastOfMonth = new Date(Date.UTC(Number(to.slice(0, 4)), mm(to) + 1, 0)).getUTCDate();
const wholeMonth = dd(from) === 1 && from.slice(0, 7) === to.slice(0, 7) && dd(to) === lastOfMonth;
const period = wholeMonth ? `${MONTHS[mm(from)]} ${from.slice(0, 4)}` : `${dd(from)} ${MON[mm(from)]} – ${dd(to)} ${MON[mm(to)]} ${to.slice(0, 4)}`;
const name: string = String(S.client.name).replace(/\s*\(.*\)$/, "").replace(/\s+(BV|BVBA|NV|SRL|Ltd)$/i, "");
const nl = (n: number) => Math.round(n).toLocaleString("nl-BE");
const KIND: Record<string, [string, string]> = { aanvraag: ["aanvraag", "aanvragen"], afspraak: ["afspraak", "afspraken"], reservatie: ["reservatie", "reservaties"], bestelling: ["bestelling", "bestellingen"], lead: ["lead", "leads"] };

const visits = (S.visits_daily as any[]).map((d) => ({ label: `${dd(d.day)} ${MON[mm(d.day)]}`, v: Number(d.visitors) }));
const visitors = visits.reduce((a, d) => a + d.v, 0), pageviews = (S.visits_daily as any[]).reduce((a, d) => a + Number(d.pageviews), 0);
const best = [...visits].sort((a, b) => b.v - a.v)[0];
const comparable = Number(S.prev_days) >= days * 0.8;             // only compare with a period we measured in full
const pct = (now: number, prev: number) => (prev > 0 ? Math.round(((now - prev) / prev) * 100) : null);
const vTrend = comparable ? pct(visitors, Number(S.visits_prev)) : null;
const records = (S.records as any[]).map((r) => ({ kind: r.kind as string, n: Number(r.n) }));
const requests = records.reduce((a, r) => a + r.n, 0);
const rTrend = Number(S.records_prev) > 0 ? pct(requests, Number(S.records_prev)) : null;
// requests per day, days without one included, so the chart matches the visitors chart
const perDay: { label: string; v: number }[] = [];
for (let i = 0; i < days; i++) { const d = new Date(Date.parse(from) + i * 864e5).toISOString().slice(0, 10); perDay.push({ label: `${dd(d)} ${MON[mm(d)]}`, v: Number((S.records_daily as any[]).find((r) => r.day === d)?.n ?? 0) }); }
const pages = (S.pages as any[]).map((p) => ({ label: p.path === "/" ? "Startpagina" : p.path, v: Number(p.views) }));
const pagesKnown = pages.reduce((a, p) => a + p.v, 0) >= pageviews * 0.2;   // page detail only when it covers a real share of the traffic
const devices = (S.devices as any[]).filter((d) => d.label !== "Onbekend").map((d) => ({ label: d.label === "Mobile" ? "Mobiel" : d.label, v: Number(d.value) }));
const sites = S.sites as any[], up = sites.filter((s) => s.status !== "down").length;
const ms = sites.length ? Math.round(sites.reduce((a, s) => a + Number(s.ms || 0), 0) / sites.length) : 0;
const backedUp = sites.length > 0 && sites.every((s) => s.backup && Date.parse(to) - Date.parse(String(s.backup).slice(0, 10)) < 3 * 864e5 || (s.backup && String(s.backup).slice(0, 10) >= to));
const target = Number(S.client.videos_per_month || 0), sent = Number(S.videos?.sent || 0), posted = Number(S.videos?.posted || 0);
const trendText = (p: number | null) => (p === null ? "" : p === 0 ? "gelijk aan de periode ervoor" : `${p > 0 ? "+" : "−"}${Math.abs(p)}% tegenover de periode ervoor`);

function seeded(seed: string) { let h = 2166136261; for (const ch of seed) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; }; }
const rnd = seeded(S.client.id + to), pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const monthNo = Number(to.slice(0, 4)) * 12 + mm(to);
const look = { theme: ["vault", "studio", "aurora", "ledger"][monthNo % 4], acc: S.client.brand_color || null, transition: pick(["wipe", "push", "iris", "blinds"]), reach: pick(["area", "bars"]), key: Math.floor(rnd() * 5), bpm: pick([92, 100, 108]) };

type Scene = Record<string, unknown> & { id: string; type: string; chapter: string; kicker: string; title: string; vo: string; sub: string; min: number };
const scenes: Scene[] = [];
const add = (s: Omit<Scene, "vo" | "sub" | "min"> & { min?: number }) => scenes.push({ vo: "", sub: "", min: 6.5, ...s } as Scene);
add({ id: "open", type: "title", chapter: "Rapport", kicker: `Maandrapport · ${period}`, title: name, subtitle: "Wat uw website en sociale media opleverden", note: sites.length ? sites.map((s) => String(s.url || s.name).replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")).join(" · ") : "", min: 4.5 });
if (visitors > 0) add({ id: "visitors", type: "c_chart", chapter: "Bezoekers", kicker: period, title: "Bezoekers op uw website", big: visitors, bigLabel: "bezoekers", note: trendText(vTrend), facts: [[nl(pageviews), "pagina's bekeken"], [nl(visitors / days), "bezoekers per dag"], [best ? `${best.v} op ${best.label}` : "", "drukste dag"]], rows: visits, form: look.reach, chartLabel: "Bezoekers per dag" });
if (pagesKnown && pages.length > 1) add({ id: "pages", type: "c_bars", chapter: "Pagina's", kicker: period, title: "Wat bezoekers bekeken", rows: pages.slice(0, 6), side: devices, sideLabel: "Toestel" });
if (requests > 0) add({ id: "requests", type: "c_chart", chapter: "Aanvragen", kicker: period, title: "Aanvragen via uw website", big: requests, bigLabel: records.length === 1 ? KIND[records[0].kind]?.[requests === 1 ? 0 : 1] ?? "aanvragen" : "aanvragen en boekingen", note: trendText(rTrend), facts: [...(records.length > 1 ? records.slice(0, 3) : []).map((r) => [nl(r.n), KIND[r.kind]?.[r.n === 1 ? 0 : 1] ?? r.kind]), ...(visitors ? [[`${((requests / visitors) * 100).toFixed(1).replace(".", ",")}%`, "van de bezoekers neemt contact op"]] : [])].slice(0, 3), rows: perDay, form: "bars", chartLabel: "Aanvragen per dag" });
if (target > 0 || sent > 0) add({ id: "videos", type: "c_slots", chapter: "Video's", kicker: period, title: "Video's voor uw sociale media", big: sent, bigLabel: target ? `van de ${target} video's geleverd` : "video's geleverd", target: Math.max(target, sent), sent, posted, facts: [[nl(posted), "geplaatst"], [nl(Math.max(0, sent - posted)), "klaar om te plaatsen"]] });
if (sites.length) add({ id: "health", type: "c_tiles", chapter: "Techniek", kicker: period, title: "Uw website draait", tiles: [[up === sites.length ? "Online" : `${up}/${sites.length}`, sites.length === 1 ? "status van de website" : "websites online", up === sites.length], [`${(ms / 1000).toFixed(2).replace(".", ",")} s`, "reactietijd van de server", ms < 1500], [String(S.incidents), Number(S.incidents) === 1 ? "storing" : "storingen", Number(S.incidents) === 0], ...(backedUp ? [["Dagelijks", "back-up van code en gegevens", true]] : [])] });
const stats: [string, string][] = [];
if (visitors) stats.push([nl(visitors), "bezoekers"]);
if (requests) stats.push([nl(requests), "aanvragen"]);
if (sent) stats.push([nl(sent), "video's"]);
if (sites.length && stats.length < 3) stats.push([String(S.incidents), Number(S.incidents) === 1 ? "storing" : "storingen"]);
add({ id: "end", type: "end", chapter: "Einde", kicker: period, title: "Verzorgd door Solyn Global", stats: stats.slice(0, 3), min: 5 });

const logo = path.resolve(P, "../public/logos", `${S.client.id}.png`);
if (fs.existsSync(logo)) fs.copyFileSync(logo, path.join(P, "logo.png")); else fs.rmSync(path.join(P, "logo.png"), { force: true });
const sky = visits.length ? visits.filter((_, i) => i % Math.ceil(visits.length / 12) === 0).map((d) => ({ color: look.acc || "#8A93A6", mrr: d.v })) : Array.from({ length: 8 }, (_, i) => ({ color: look.acc || "#8A93A6", mrr: 3 + ((i * 7) % 5) }));
fs.writeFileSync(path.join(P, "plan.json"), JSON.stringify({ mode: "client", day: to, dateLabel: period, sinceLabel: period, brand: name.toUpperCase(), look, scenes, sky, n: { visitors, pageviews, requests, sent, posted } }, null, 1));
fs.writeFileSync(path.join(P, "lines.json"), "[]");
console.log("client", name, period, look.theme, scenes.map((s) => s.id).join(","), "|", visitors, "visitors", requests, "requests", sent, "videos");
