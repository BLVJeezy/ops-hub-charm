/** Client requests: what a client can ask for, how it is checked, priced and sorted. Shared by the public page, the server and the Hub. */

export const PAGE_RATE = 85; // minimum price of one new page, in euro

export const KINDS = [
  {
    id: "wijziging",
    label: "Iets aanpassen",
    hint: "Tekst, foto's of prijzen op een bestaande pagina",
  },
  { id: "nieuwe-pagina", label: "Nieuwe pagina", hint: `Minimaal €${PAGE_RATE} per pagina` },
  { id: "seo", label: "Gevonden worden (SEO)", hint: "Google, zoekwoorden, Google-profiel" },
  { id: "social", label: "Social media", hint: "Posts, video's, planning" },
  {
    id: "probleem",
    label: "Er werkt iets niet",
    hint: "Een fout op de site of in de app. Dit krijgt altijd voorrang.",
  },
  {
    id: "andere",
    label: "Iets anders",
    hint: "Een algemene vraag of idee: je krijgt antwoord binnen 48 à 72 uur.",
  },
] as const;
export type Kind = (typeof KINDS)[number]["id"];

export const URGENCY = [
  { id: "laag", label: "Geen haast", hint: "Wanneer het past" },
  { id: "normaal", label: "Normaal", hint: "Binnen 1 à 2 weken" },
  { id: "hoog", label: "Liefst snel", hint: "Deze week" },
  {
    id: "dringend",
    label: "Binnen 24u",
    hint: "Spoed binnen 24 uur. Dit kan extra gefactureerd worden, omdat je aanvraag dan voorgaat op die van andere klanten.",
  },
] as const;
export type Urgency = (typeof URGENCY)[number]["id"];

export const STATUS = ["nieuw", "ingepland", "bezig", "klaar", "afgewezen"] as const;
export type Status = (typeof STATUS)[number];
export const STATUS_LABEL: Record<Status, string> = {
  nieuw: "Ontvangen",
  ingepland: "Ingepland",
  bezig: "Bezig",
  klaar: "Klaar",
  afgewezen: "Niet uitgevoerd",
};

/** My own priority, 1 = first. */
export const PRIORITY_LABEL: Record<number, string> = {
  1: "Eerst",
  2: "Hoog",
  3: "Normaal",
  4: "Later",
};

export type RequestInput = {
  title: string;
  details?: string;
  kind: Kind;
  pages?: number | null;
  urgency?: Urgency;
  wished_date?: string | null;
  contact_name?: string;
  contact_email?: string;
};

export const LIMITS = { title: 140, details: 4000, pages: 50, openPerClient: 15 };

/** €85 per page: the minimum for a new page. Null when the request is not about new pages. */
export function estimate(kind: Kind, pages?: number | null): number | null {
  if (kind !== "nieuwe-pagina") return null;
  return Math.max(1, Math.round(pages || 1)) * PAGE_RATE;
}

/** Returns an error message for the client, or null when the request can be filed. */
export function checkRequest(r: Partial<RequestInput>, today: string): string | null {
  const title = (r.title ?? "").trim();
  if (title.length < 3) return "Geef je aanvraag een korte titel.";
  if (title.length > LIMITS.title) return `De titel mag maximaal ${LIMITS.title} tekens zijn.`;
  if ((r.details ?? "").length > LIMITS.details)
    return `De uitleg mag maximaal ${LIMITS.details} tekens zijn.`;
  if (!KINDS.some((k) => k.id === r.kind)) return "Kies wat voor aanvraag het is.";
  // the client no longer picks urgency; old links may still send one
  if (r.urgency && !URGENCY.some((u) => u.id === r.urgency)) return "Kies hoe dringend het is.";
  if (r.kind === "nieuwe-pagina") {
    const p = Number(r.pages ?? 1);
    if (!Number.isInteger(p) || p < 1 || p > LIMITS.pages)
      return `Kies tussen 1 en ${LIMITS.pages} pagina's.`;
  }
  if (r.wished_date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.wished_date)) return "Die datum klopt niet.";
    if (r.wished_date < today) return "De gewenste datum ligt in het verleden.";
  }
  if (r.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.contact_email.trim()))
    return "Dat e-mailadres klopt niet.";
  return null;
}

export type RequestRow = {
  id: string;
  status: Status;
  priority: number | null;
  urgency: Urgency;
  wished_date: string | null;
  created_at: string;
};

const URGENCY_RANK: Record<Urgency, number> = { dringend: 1, hoog: 2, normaal: 3, laag: 4 };
const OPEN: Status[] = ["nieuw", "ingepland", "bezig"];
export const isOpen = (s: Status) => OPEN.includes(s);

/**
 * The order I work through them: open before done; then my priority (or the client's urgency until I set one);
 * then the nearest wished date; then oldest first.
 */
export function byPriority<T extends RequestRow>(rows: T[]): T[] {
  const rank = (r: T) => r.priority ?? URGENCY_RANK[r.urgency];
  return [...rows].sort(
    (a, b) =>
      Number(!isOpen(a.status)) - Number(!isOpen(b.status)) ||
      rank(a) - rank(b) ||
      Number(a.priority == null) - Number(b.priority == null) ||
      (a.wished_date ?? "9999").localeCompare(b.wished_date ?? "9999") ||
      a.created_at.localeCompare(b.created_at),
  );
}

export const kindLabel = (k: string) => KINDS.find((x) => x.id === k)?.label ?? k;
export const urgencyLabel = (u: string) => URGENCY.find((x) => x.id === u)?.label ?? u;
/** "Villa Amano" → "villa-amano"; "DynaMik (SRL Energy Life)" → "dynamik". Only for a readable link; the token is the key. */
export const slugOf = (name: string) =>
  name
    .replace(/\s*\(.*\)\s*$/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " en ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "klant";
/** The client's own page on the company website. The token sits after the #, so it never reaches a server log. */
export const requestLink = (token: string, name: string) =>
  `https://solynglobal.be/client/${slugOf(name)}#${token}`;

/** How soon the client hears back: urgent within 24 hours, a general question within 48 to 72 hours. Null when the urgency already says it. */
export function answerWithin(
  kind: Kind,
  urgency?: Urgency,
): { hours: number; label: string } | null {
  if (kind === "probleem" || urgency === "dringend") return { hours: 24, label: "binnen 24 uur" };
  if (kind === "andere") return { hours: 72, label: "binnen 48 à 72 uur" };
  return null;
}
/** Our own priority for a new request: something that does not work always goes first. */
export const autoPriority = (kind: Kind): number | null => (kind === "probleem" ? 1 : null);
/** The latest moment to answer a new request, or null when no answer time applies. */
export function answerBy(r: { kind: Kind; urgency: Urgency; created_at: string }): string | null {
  const w = answerWithin(r.kind, r.urgency);
  return w ? new Date(Date.parse(r.created_at) + w.hours * 3600_000).toISOString() : null;
}
