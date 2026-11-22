/** Growth ideas: one improvement per client site, proposed twice a day, built after your OK. */

export type IdeaStatus =
  | "voorgesteld" | "ingepland" | "bezig" | "ter_controle" | "aanpassen" | "live_zetten" | "live"
  | "terugzetten" | "teruggezet" | "annuleren" | "geannuleerd" | "overgeslagen" | "mislukt";

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
  feedback: string | null;
  merge_sha: string | null;
  reverted_at: string | null;
  rounds: number;
  created_at: string;
  updated_at: string;
};

export const STATUS: Record<IdeaStatus, { label: string; tone: "new" | "wait" | "work" | "check" | "ok" | "off" | "bad" }> = {
  voorgesteld: { label: "Nieuw idee", tone: "new" },
  ingepland: { label: "In de wachtrij", tone: "wait" },
  bezig: { label: "Claude bouwt", tone: "work" },
  ter_controle: { label: "Na te kijken", tone: "check" },
  aanpassen: { label: "Wordt aangepast", tone: "work" },
  live_zetten: { label: "Gaat live", tone: "work" },
  live: { label: "Gebruikt · live", tone: "ok" },
  terugzetten: { label: "Wordt teruggezet", tone: "work" },
  teruggezet: { label: "Teruggezet", tone: "off" },
  annuleren: { label: "Wordt teruggedraaid", tone: "work" },
  geannuleerd: { label: "Afgekeurd na preview", tone: "off" },
  overgeslagen: { label: "Afgekeurd", tone: "off" },
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

/** The five piles on the page: what is new, what is moving, what waits for you, what is used, what is rejected. */
export type Pile = "nieuw" | "bezig" | "controle" | "gebruikt" | "afgekeurd";
export function pileOf(i: Pick<Idea, "status" | "task_id">): Pile {
  if (i.task_id) return "gebruikt"; // a tip you turned into a task counts as used
  switch (i.status) {
    case "voorgesteld":
      return "nieuw";
    case "ter_controle":
      return "controle";
    case "live":
      return "gebruikt";
    case "overgeslagen":
    case "geannuleerd":
    case "teruggezet":
      return "afgekeurd";
    default:
      return "bezig"; // ingepland, bezig, aanpassen, live_zetten, terugzetten, annuleren, mislukt
  }
}
export const PILES: { id: Pile; label: string }[] = [
  { id: "nieuw", label: "Nieuw" },
  { id: "controle", label: "Na te kijken" },
  { id: "bezig", label: "Bezig" },
  { id: "gebruikt", label: "Gebruikt" },
  { id: "afgekeurd", label: "Afgekeurd" },
];

/** Which buttons a card shows. */
export function actionsFor(i: Pick<Idea, "status" | "kind"> & { task_id?: string | null }) {
  return {
    deploy: i.status === "voorgesteld" && i.kind === "code",
    task: i.status === "voorgesteld" && i.kind === "tip",
    skip: i.status === "voorgesteld",
    editQueued: i.status === "ingepland",
    unqueue: i.status === "ingepland",
    review: i.status === "ter_controle",
    revise: i.status === "ter_controle",
    rollback: i.status === "live",
    retry: i.status === "mislukt",
    reopen: (i.status === "overgeslagen" || i.status === "geannuleerd" || i.status === "teruggezet") && !i.task_id,
  };
}

/** Open = still needs you or Claude. */
export const isOpen = (s: IdeaStatus) => !["live", "geannuleerd", "overgeslagen", "teruggezet"].includes(s);
