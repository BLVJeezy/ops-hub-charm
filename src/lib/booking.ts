/** The public booking page: which hours a client can pick for a meeting. All clock times are Europe/Brussels. */
export type Busy = { start: string; end: string };   // ISO instants
export type BookingRules = { days: number[]; from: number; to: number; minutes: number; noticeHours: number; horizonDays: number };
/**
 * Monday to Saturday, between 13:00 and 17:00 (mornings are for work blocks), one hour, at least a day ahead, four weeks out.
 * Work blocks in that window do not block a booking: they are what fills the afternoon when nobody books.
 */
export const RULES: BookingRules = { days: [1, 2, 3, 4, 5, 6], from: 13, to: 17, minutes: 60, noticeHours: 24, horizonDays: 28 };
const ZONE = "Europe/Brussels";

const parts = (d: Date) => Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" }).formatToParts(d).map((p) => [p.type, p.value]));
/** The calendar day (YYYY-MM-DD) in Brussels of an instant. */
export const brusselsDay = (d: Date) => { const p = parts(d); return `${p.year}-${p.month}-${p.day}`; };
/** The instant of a clock time in Brussels, correct across summer and winter time. */
export function brusselsTime(day: string, hour: number, minute = 0): Date {
  const [y, m, d] = day.split("-").map(Number), guess = new Date(Date.UTC(y, m - 1, d, hour, minute));
  const p = parts(guess), shown = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
  return new Date(guess.getTime() - (shown - guess.getTime()));
}
const weekdayOf = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();
const nextDay = (day: string) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };

/** Every free start time, soonest first: inside the opening hours, far enough ahead, and clear of anything busy. */
export function freeSlots(now: Date, busy: Busy[], rules: BookingRules = RULES): string[] {
  const earliest = now.getTime() + rules.noticeHours * 36e5, taken = busy.map((b) => [Date.parse(b.start), Date.parse(b.end)] as const).filter(([s, e]) => e > s);
  const out: string[] = [];
  let day = brusselsDay(now);
  for (let i = 0; i <= rules.horizonDays; i++, day = nextDay(day)) {
    if (!rules.days.includes(weekdayOf(day))) continue;
    for (let min = rules.from * 60; min + rules.minutes <= rules.to * 60; min += rules.minutes) {
      const start = brusselsTime(day, Math.floor(min / 60), min % 60).getTime(), end = start + rules.minutes * 6e4;
      if (start < earliest) continue;
      if (taken.some(([s, e]) => s < end && e > start)) continue;
      out.push(new Date(start).toISOString());
    }
  }
  return out;
}
export type BookingInput = { name: string; email: string; phone: string; company: string; note: string; start: string; mode: "online" | "onsite"; location: string; topics: string[] };
/** What a meeting can be about; a visitor ticks any of them. */
export const TOPICS = ["SEO", "Webdesign", "Applicatie", "Social media"] as const;
/** Files a client may add to a booking: photos and PDFs, a few of them, not too big. */
export const FILE_RULES = { max: 5, maxBytes: 8 * 1024 * 1024, totalBytes: 20 * 1024 * 1024, types: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"] };
export const FILE_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf";
export function checkFiles(files: { name: string; size: number; type: string }[]): string | null {
  if (files.length > FILE_RULES.max) return `Voeg hoogstens ${FILE_RULES.max} bestanden toe.`;
  const wrong = files.find((f) => !FILE_RULES.types.includes(f.type));
  if (wrong) return `${wrong.name}: alleen foto's (JPG, PNG, WebP, HEIC) en pdf's kunnen.`;
  const big = files.find((f) => f.size > FILE_RULES.maxBytes);
  if (big) return `${big.name} is te groot. Een bestand mag hoogstens 8 MB zijn.`;
  if (files.reduce((s2, f) => s2 + f.size, 0) > FILE_RULES.totalBytes) return "Samen zijn de bestanden te groot (hoogstens 20 MB).";
  return null;
}
/** A file name that is safe as a storage path. */
export const safeName = (name: string) => name.normalize("NFKD").replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "-").slice(-80) || "bestand";
/** Cleans what a visitor typed; returns a message when something needed is missing. */
export function checkBooking(raw: Record<string, unknown>): { ok: true; value: BookingInput } | { ok: false; error: string } {
  const s = (k: string, max: number) => String(raw[k] ?? "").trim().slice(0, max);
  const mode: BookingInput["mode"] = s("mode", 10) === "onsite" ? "onsite" : "online";
  const value = { name: s("name", 120), email: s("email", 200).toLowerCase(), phone: s("phone", 40), company: s("company", 120), note: s("note", 1000), start: s("start", 40), mode, location: mode === "onsite" ? s("location", 200) : "", topics: TOPICS.filter((t) => String(raw.topics ?? "").split(",").map((x) => x.trim()).includes(t)) as string[] };
  if (value.name.length < 2) return { ok: false, error: "Vul je naam in." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.email)) return { ok: false, error: "Vul een geldig e-mailadres in." };
  if (Number.isNaN(Date.parse(value.start))) return { ok: false, error: "Kies een tijdstip." };
  if (mode === "onsite" && value.location.length < 5) return { ok: false, error: "Vul het adres in waar we afspreken." };
  return { ok: true, value };
}
/** "vrijdag 20 november om 15:00" */
export function whenLabel(iso: string): string {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat("nl-BE", { timeZone: ZONE, weekday: "long", day: "numeric", month: "long" }).format(d);
  const time = new Intl.DateTimeFormat("nl-BE", { timeZone: ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  return `${date} om ${time}`;
}
