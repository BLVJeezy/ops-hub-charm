/** The Agenda page: meetings, bookings, work blocks and Pathé shifts in one week view, in each client's colour. */
export type AgendaKind = "booking" | "meeting" | "block" | "pathe" | "other";
export type AgendaItem = { id: string; start: string; end: string; title: string; kind: AgendaKind; clientId: string | null; color: string; contact?: { email: string; phone: string | null; company: string | null; note: string | null; mode: "online" | "onsite"; location: string | null; topics: string[]; files: { name: string; path: string }[] } };
const ZONE = "Europe/Brussels";

/** What a calendar item is, from its title. */
export function kindOf(title: string): AgendaKind {
  const t = title.toLowerCase();
  if (t.startsWith("werkblok")) return "block";
  if (t.startsWith("pathé") || t.startsWith("pathe")) return "pathe";
  if (/afspraak|gesprek|meeting|call|overleg|shoot|opleiding/.test(t)) return "meeting";
  return "other";
}
/** The client a calendar item is about: the first client whose name appears in the title. */
export function clientOf(title: string, clients: { id: string; name: string }[]): string | null {
  const t = title.toLowerCase();
  const hit = [...clients].sort((a, b) => b.name.length - a.name.length).find((c) => { const n = c.name.replace(/\s*\(.*\)$/, "").replace(/\s+(bv|srl|nv|ltd)$/i, "").toLowerCase(); return n.length > 2 && t.includes(n); });
  return hit?.id ?? null;
}
export const KIND_COLOR: Record<AgendaKind, string> = { booking: "#C9A14A", meeting: "#C9A14A", block: "#8A93A6", pathe: "#6B7280", other: "#8A93A6" };

/** Google Calendar has eleven event colours. The one closest to a client's own colour, by its number. */
const GOOGLE: [string, string][] = [["1", "#7986cb"], ["2", "#33b679"], ["3", "#8e24aa"], ["4", "#e67c73"], ["5", "#f6bf26"], ["6", "#f4511e"], ["7", "#039be5"], ["8", "#616161"], ["9", "#3f51b5"], ["10", "#0b8043"], ["11", "#d50000"]];
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
export function googleColor(hex: string | null | undefined): string {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return "8";
  const [r, g, b] = rgb(hex);
  return GOOGLE.map(([id, h]) => { const [x, y, z] = rgb(h); return [id, (r - x) ** 2 + (g - y) ** 2 + (b - z) ** 2] as const; }).sort((a, b2) => a[1] - b2[1])[0][0];
}

export const dayOf = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(new Date(iso));
export const timeOf = (iso: string) => new Intl.DateTimeFormat("nl-BE", { timeZone: ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
/** The seven days (YYYY-MM-DD) of the week that holds `day`, Monday first; `shift` moves by whole weeks. */
export function weekOf(day: string, shift = 0): string[] {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + shift * 7);
  return Array.from({ length: 7 }, (_, i) => { const x = new Date(d); x.setUTCDate(d.getUTCDate() + i); return x.toISOString().slice(0, 10); });
}
/** Items per day of the week, earliest first. A booking that is also in the calendar shows once, as the booking. */
export function perDay(items: AgendaItem[], days: string[]): Record<string, AgendaItem[]> {
  const booked = new Set(items.filter((i) => i.kind === "booking").map((i) => new Date(i.start).getTime()));
  const out: Record<string, AgendaItem[]> = Object.fromEntries(days.map((d) => [d, []]));
  for (const i of items) {
    if (i.kind !== "booking" && booked.has(new Date(i.start).getTime()) && /^gesprek/i.test(i.title)) continue;
    const d = dayOf(i.start);
    if (out[d]) out[d].push(i);
  }
  for (const d of days) out[d].sort((a, b) => a.start.localeCompare(b.start));
  return out;
}
