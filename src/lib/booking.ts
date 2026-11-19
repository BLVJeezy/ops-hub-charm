/** The public booking page: which hours a client can pick for a meeting. All clock times are Europe/Brussels. */
export type Busy = { start: string; end: string };   // ISO instants
export type BookingRules = { days: number[]; from: number; to: number; minutes: number; noticeHours: number; horizonDays: number };
/** Monday to Saturday, never before 13:00 (mornings are for work blocks), until 18:00, one hour, at least a day ahead, four weeks out. */
export const RULES: BookingRules = { days: [1, 2, 3, 4, 5, 6], from: 13, to: 18, minutes: 60, noticeHours: 24, horizonDays: 28 };
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
export type BookingInput = { name: string; email: string; phone: string; company: string; note: string; start: string };
/** Cleans what a visitor typed; returns a message when something needed is missing. */
export function checkBooking(raw: Record<string, unknown>): { ok: true; value: BookingInput } | { ok: false; error: string } {
  const s = (k: string, max: number) => String(raw[k] ?? "").trim().slice(0, max);
  const value = { name: s("name", 120), email: s("email", 200).toLowerCase(), phone: s("phone", 40), company: s("company", 120), note: s("note", 1000), start: s("start", 40) };
  if (value.name.length < 2) return { ok: false, error: "Vul je naam in." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.email)) return { ok: false, error: "Vul een geldig e-mailadres in." };
  if (Number.isNaN(Date.parse(value.start))) return { ok: false, error: "Kies een tijdstip." };
  return { ok: true, value };
}
/** "vrijdag 20 november om 15:00" */
export function whenLabel(iso: string): string {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat("nl-BE", { timeZone: ZONE, weekday: "long", day: "numeric", month: "long" }).format(d);
  const time = new Intl.DateTimeFormat("nl-BE", { timeZone: ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  return `${date} om ${time}`;
}
