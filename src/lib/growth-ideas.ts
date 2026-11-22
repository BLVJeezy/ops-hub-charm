/** Growth ideas: one improvement per client site, proposed twice a day, built after your OK. */

export type IdeaStatus =
  | "voorgesteld" | "ingepland" | "bezig" | "ter_controle" | "live_zetten" | "live"
  | "annuleren" | "geannuleerd" | "overgeslagen" | "mislukt";

export type Idea = {
  id: string;
  site_id: string | null;
  client_id: string | null;
  batch: string;
  area: string;
  impact: "hoog" | "middel" | "laag";
  kind: "code" | "tip";
  title: string;
  why: string;
  findings: { label: string; value?: string }[] | null;
  prompt: string;
  status: IdeaStatus;
  approved_prompt: string | null;
  approved_at: string | null;
  started_at: string | null;
  branch: string | null;
  preview_url: string | null;
  diff_url: string | null;
  result_summary: string | null;
  review_at: string | null;
  decided_at: string | null;
  finished_at: string | null;
  error: string | null;
  task_id: string | null;
  created_at: string;
  updated_at: string;
};

export const STATUS: Record<IdeaStatus, { label: string; tone: "new" | "wait" | "work" | "check" | "ok" | "off" | "bad" }> = {
  voorgesteld: { label: "Nieuw idee", tone: "new" },
  ingepland: { label: "In de wachtrij", tone: "wait" },
  bezig: { label: "Claude bouwt", tone: "work" },
  ter_controle: { label: "Na te kijken", tone: "check" },
  live_zetten: { label: "Gaat live", tone: "work" },
  live: { label: "Live", tone: "ok" },
  annuleren: { label: "Wordt teruggedraaid", tone: "work" },
  geannuleerd: { label: "Geannuleerd", tone: "off" },
  overgeslagen: { label: "Overgeslagen", tone: "off" },
  mislukt: { label: "Mislukt", tone: "bad" },
};

export const AREA_LABEL: Record<string, string> = {
  seo: "SEO",
  vindbaarheid: "Vindbaarheid",
  marketing: "Marketing",
  conversie: "Meer aanvragen",
  snelheid: "Snelheid",
  content: "Content",
  techniek: "Techniek",
};

/** The line that goes in front of every prompt you send: your explicit go-ahead, with its limits. */
export function consentLine(by: string, at: Date, site: { name: string; repo: string | null }) {
  const when = at.toLocaleString("nl-BE", { timeZone: "Europe/Brussels", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return `Toestemming: ${by} geeft je op ${when} toestemming om dit te bouwen voor ${site.name}${site.repo ? ` (${site.repo})` : ""}, op een aparte branch en een preview. Niet live zetten: dat gebeurt pas na bevestiging in de Hub.`;
}

/** Which buttons a card shows. */
export function actionsFor(i: Pick<Idea, "status" | "kind">) {
  return {
    deploy: i.status === "voorgesteld" && i.kind === "code",
    task: i.status === "voorgesteld" && i.kind === "tip",
    skip: i.status === "voorgesteld",
    unqueue: i.status === "ingepland",
    review: i.status === "ter_controle",
    retry: i.status === "mislukt",
  };
}

/** Open = still needs you or Claude. */
export const isOpen = (s: IdeaStatus) => !["live", "geannuleerd", "overgeslagen"].includes(s);
