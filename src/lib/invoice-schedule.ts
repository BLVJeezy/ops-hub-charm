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
