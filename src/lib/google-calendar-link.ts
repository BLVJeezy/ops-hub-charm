/**
 * A link that opens Google Calendar with a new event already filled in (title, time, place, details).
 * One tap, then "Opslaan" in Google. Works on the phone app and on the web, and needs no Google login in the Hub.
 */
export type CalendarEvent = {
  title: string;
  start: string;
  end: string;
  location?: string | null;
  details?: string | null;
};

const stamp = (iso: string) =>
  new Date(iso)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");

export function googleCalendarUrl(e: CalendarEvent): string {
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${stamp(e.start)}/${stamp(e.end)}`,
    ctz: "Europe/Brussels",
  });
  if (e.details) q.set("details", e.details.slice(0, 1500));
  if (e.location) q.set("location", e.location);
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

/** The event for a booked appointment: who, how, what about, and how to reach them. */
export function bookingEvent(
  b: {
    name: string;
    company?: string | null;
    email: string;
    phone?: string | null;
    start: string;
    end: string;
    mode: "online" | "onsite";
    location?: string | null;
    topics?: string[];
    note?: string | null;
  },
  hubUrl = "https://solyn22.lovable.app/agenda",
): CalendarEvent {
  const lines = [
    b.mode === "onsite" ? `Ter plaatse: ${b.location ?? ""}` : "Online meeting (stuur de link)",
    b.topics?.length ? `Onderwerp: ${b.topics.join(", ")}` : "",
    `Contact: ${b.name}${b.company ? ` (${b.company})` : ""}`,
    `E-mail: ${b.email}`,
    b.phone ? `Telefoon: ${b.phone}` : "",
    b.note ? `\n${b.note}` : "",
    `\nHub: ${hubUrl}`,
  ].filter(Boolean);
  return {
    title: `Afspraak: ${b.company || b.name}`,
    start: b.start,
    end: b.end,
    location: b.mode === "onsite" ? (b.location ?? "") : "Online",
    details: lines.join("\n"),
  };
}
