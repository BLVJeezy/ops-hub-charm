// Pure date/text helpers for scheduled and repeating invoices. Tested in invoice-schedule.test.ts.

/** Today's date in Belgium as YYYY-MM-DD. */
export function brusselsToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Brussels",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function daysInMonth(y: number, m0: number): number {
  return new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
}

/**
 * The next date on `day` of the month after `fromIso` (YYYY-MM-DD).
 * Day is clamped to the month's length, so day 31 gives 28/29 Feb and 30 Apr,
 * but the anchor day is kept, so the following month is back on the 31st.
 */
export function nextMonthlyDate(fromIso: string, day: number): string {
  const [y, m] = fromIso.split("-").map(Number);
  const m0 = m; // next month, 0-based = current 1-based
  const year = y + Math.floor(m0 / 12);
  const month0 = m0 % 12;
  const d = Math.min(Math.max(1, day), daysInMonth(year, month0));
  return `${year}-${String(month0 + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Current hour (0–23) in Belgium. */
export function brusselsHour(now: Date = new Date()): number {
  const h = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Brussels", hour: "2-digit", hourCycle: "h23" }).format(now);
  return Number(h) % 24;
}

export const DEFAULT_SEND_HOUR = 10;

/** Is something planned for `dateIso` at `hour` (Belgian time) due at `now`? */
export function isDueAt(dateIso: string, hour: number | null | undefined, now: Date = new Date()): boolean {
  const today = brusselsToday(now);
  if (dateIso < today) return true;
  if (dateIso > today) return false;
  return brusselsHour(now) >= (hour ?? DEFAULT_SEND_HOUR);
}

export function hourLabel(hour: number | null | undefined): string {
  return `${String(hour ?? DEFAULT_SEND_HOUR).padStart(2, "0")}:00`;
}

/** First date after `todayIso` that falls on `day` of a month (clamped to short months). */
export function nextOccurrence(todayIso: string, day: number): string {
  const [y, m] = todayIso.split("-").map(Number);
  const thisMonth = `${y}-${String(m).padStart(2, "0")}-${String(Math.min(day, daysInMonth(y, m - 1))).padStart(2, "0")}`;
  return thisMonth > todayIso ? thisMonth : nextMonthlyDate(todayIso, day);
}

/** YYYY-MM-DD plus `n` days. */
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

export function dayOf(iso: string): number {
  return Number(iso.split("-")[2]);
}

const MONTHS: Record<string, string[]> = {
  nl: [
    "januari",
    "februari",
    "maart",
    "april",
    "mei",
    "juni",
    "juli",
    "augustus",
    "september",
    "oktober",
    "november",
    "december",
  ],
  en: [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ],
  fr: [
    "janvier",
    "février",
    "mars",
    "avril",
    "mai",
    "juin",
    "juillet",
    "août",
    "septembre",
    "octobre",
    "novembre",
    "décembre",
  ],
};

const ALL = Object.entries(MONTHS).flatMap(([lang, names]) =>
  names.map((n, i) => ({ lang, i, n })),
);
// Longest names first so "maart" doesn't shadow anything and "mei"/"may" match as whole words.
const RE = new RegExp(
  `\\b(${ALL.map((a) => a.n)
    .sort((a, b) => b.length - a.length)
    .join("|")})(\\s+)(\\d{4})\\b`,
  "gi",
);

function matchCase(word: string, like: string): string {
  if (like === like.toUpperCase()) return word.toUpperCase();
  if (like[0] === like[0].toUpperCase()) return word[0].toUpperCase() + word.slice(1);
  return word;
}

/**
 * Move "<month> <year>" mentions forward by `months`, keeping language and capitalisation.
 * "SEO November 2026" → "SEO December 2026"; "Hosting december 2026" → "Hosting januari 2027".
 */
export function advanceMonthNames(text: string, months = 1): string {
  return text.replace(RE, (_full, name: string, space: string, year: string) => {
    const hit = ALL.find((a) => a.n === name.toLowerCase());
    if (!hit) return _full;
    const total = hit.i + months;
    const newIdx = ((total % 12) + 12) % 12;
    const newYear = Number(year) + Math.floor(total / 12);
    return `${matchCase(MONTHS[hit.lang][newIdx], name)}${space}${newYear}`;
  });
}

export type PlannedInvoice = {
  status: string;
  total: number | string | null;
  scheduled_send_at?: string | null;
  repeat_monthly?: boolean | null;
  repeat_day?: number | null;
  next_repeat_on?: string | null;
};

/** The date `months` months after `iso`, day clamped to the month's length. */
export function addMonthsIso(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = y * 12 + (m - 1) + months;
  const year = Math.floor(t / 12), month0 = t % 12;
  const day = Math.min(d, daysInMonth(year, month0));
  return `${year}-${String(month0 + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Everything that will be invoiced from today up to and including today + `months`:
 * each scheduled draft once, and every monthly repeat once per month it falls in the window.
 * Returns the number of invoices and their total.
 */
export function plannedForecast(rows: PlannedInvoice[], today: string, months = 6): { count: number; total: number; until: string } {
  const until = addMonthsIso(today, months);
  let count = 0, total = 0;
  for (const r of rows) {
    const amount = Number(r.total || 0);
    let first: string | null = null;
    if (r.status === "Draft" && r.scheduled_send_at) first = r.scheduled_send_at;
    else if (r.repeat_monthly && (r.status === "Sent" || r.status === "Paid") && r.next_repeat_on) first = r.next_repeat_on;
    if (!first) continue;
    if (first < today) first = today; // overdue: goes out at the next run
    if (first > until) continue;
    count++; total += amount;
    if (!r.repeat_monthly) continue;
    const day = r.repeat_day ?? Number(first.slice(8, 10));
    let d = nextMonthlyDate(first, day);
    for (let i = 0; i < 240 && d <= until; i++) {
      count++; total += amount;
      d = nextMonthlyDate(d, day);
    }
  }
  return { count, total: Math.round(total * 100) / 100, until };
}

export type ServiceKey = "seo" | "website" | "social" | "oneoff";
export type ForecastLine = { description?: string | null; qty?: number | null; unit_price?: number | null; price?: number | null };
export type ForecastInvoice = PlannedInvoice & { line_items?: ForecastLine[] | null };
export type ServiceMonth = { month: string; seo: number; website: number; social: number; oneoff: number; total: number };

/** Which service an invoice line belongs to, from its description. Anything unrecognised counts as website. */
export function lineService(description: string): ServiceKey {
  const d = description.toLowerCase();
  if (/ontwikkeling|development|opstart|setup|eenmalig/.test(d)) return "oneoff";
  if (/\bseo\b|zoekmachine/.test(d)) return "seo";
  if (/social|facebook|instagram|tiktok|video/.test(d)) return "social";
  return "website";
}

/**
 * What will be invoiced per calendar month and per service, from the current month
 * through `months` months ahead. Scheduled drafts count once, monthly repeats every month.
 */
export function forecastByService(rows: ForecastInvoice[], today: string, months = 6): ServiceMonth[] {
  const out: ServiceMonth[] = [];
  for (let i = 0; i <= months; i++) out.push({ month: addMonthsIso(today.slice(0, 8) + "01", i).slice(0, 7), seo: 0, website: 0, social: 0, oneoff: 0, total: 0 });
  const last = out[out.length - 1].month;
  const add = (date: string, r: ForecastInvoice) => {
    const m = out.find((x) => x.month === date.slice(0, 7));
    if (!m) return;
    const lines = r.line_items?.length ? r.line_items : [{ description: "", qty: 1, unit_price: Number(r.total || 0) }];
    for (const l of lines) {
      const amount = Number(l.qty ?? 1) * Number(l.unit_price ?? l.price ?? 0);
      m[lineService(l.description ?? "")] += amount;
      m.total += amount;
    }
  };
  for (const r of rows) {
    let first: string | null = null;
    if (r.status === "Draft" && r.scheduled_send_at) first = r.scheduled_send_at;
    else if (r.repeat_monthly && (r.status === "Sent" || r.status === "Paid") && r.next_repeat_on) first = r.next_repeat_on;
    if (!first) continue;
    if (first < today) first = today;
    add(first, r);
    if (!r.repeat_monthly) continue;
    const day = r.repeat_day ?? Number(first.slice(8, 10));
    let d = nextMonthlyDate(first, day);
    for (let i = 0; i < 240 && d.slice(0, 7) <= last; i++) { add(d, r); d = nextMonthlyDate(d, day); }
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return out.map((m) => ({ ...m, seo: round(m.seo), website: round(m.website), social: round(m.social), oneoff: round(m.oneoff), total: round(m.total) }));
}
