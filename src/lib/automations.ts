// Everything the Hub does by itself, and what is still to be built. One list, so the Automations page and the film can both read it.
// Keep it honest: an entry is "live" only when it runs without anyone starting it.

export type Rhythm = "always" | "daily" | "weekly" | "monthly";
export type Automation = {
  id: string;
  name: string;
  what: string; // what it does, in one line
  when: string; // when it runs, in plain words
  rhythm: Rhythm;
  runs: "Hub" | "Claude-taak" | "GitHub";
  yours?: string; // what is still left to the owner
  /** which live fact shows that it ran (see the page) */
  proof?: "checked" | "backup" | "analytics" | "briefing" | "tasks" | "scheduled";
  /** where it takes its data from, and where the result lands: drawn as wires on the Automations map */
  from: Source[];
  to: Target[];
};
/** What the automations read from. */
export type Source =
  | "sites"
  | "invoices"
  | "recurring"
  | "costs"
  | "hubdata"
  | "code"
  | "maps"
  | "booking"
  | "requests";
/** Where the automations put their result. */
export type Target = "mailYou" | "mailClient" | "hub" | "film" | "backup" | "ledger" | "agenda";
export const SOURCES: { id: Source; name: string; note: string }[] = [
  { id: "sites", name: "Klantsites", note: "Websites van je klanten" },
  { id: "invoices", name: "Facturen", note: "Ingepland en verstuurd" },
  { id: "recurring", name: "Vaste taken", note: "Wekelijks en maandelijks" },
  { id: "costs", name: "Kosten", note: "Expenses en bank" },
  { id: "hubdata", name: "Hub-cijfers", note: "Omzet, klanten, taken" },
  { id: "code", name: "Code", note: "GitHub" },
  { id: "maps", name: "Google Maps", note: "Posities via LeadSnap" },
  { id: "booking", name: "Boekingspagina", note: "solynglobal.be/afspraak" },
  { id: "requests", name: "Aanvraaglinks", note: "Eén link per klant" },
];
export const TARGETS: { id: Target; name: string; note: string }[] = [
  { id: "mailYou", name: "Mail aan jou", note: "jason@solynglobal.be" },
  { id: "mailClient", name: "Mail aan klant", note: "Facturen en bevestigingen" },
  { id: "hub", name: "Hub", note: "Taken, Status, Brain" },
  { id: "agenda", name: "Agenda", note: "Afspraken en werkblokken" },
  { id: "film", name: "Film", note: "Briefing en rapporten" },
  { id: "backup", name: "Back-up", note: "Bewaard op GitHub" },
  { id: "ledger", name: "Grootboek", note: "Boekhouding" },
];
export type Planned = {
  id: string;
  name: string;
  what: string;
  needs: string;
  stage: "wacht op jou" | "klaar om te bouwen" | "idee";
};

export const LIVE: Automation[] = [
  {
    id: "monitor",
    name: "Website-bewaking",
    what: "Kijkt of elke site online is, het certificaat klopt en de database antwoordt. Bij een storing krijg je een mail.",
    when: "Elke 5 minuten",
    rhythm: "always",
    runs: "Hub",
    proof: "checked",
    from: ["sites"],
    to: ["mailYou", "hub"],
  },
  {
    id: "invoices",
    name: "Facturen versturen",
    what: "Stuurt ingeplande en maandelijkse facturen op hun dag en uur naar de klant.",
    when: "Elk uur",
    rhythm: "always",
    runs: "Hub",
    proof: "scheduled",
    from: ["invoices"],
    to: ["mailClient"],
  },
  {
    id: "tasks",
    name: "Vaste taken inplannen",
    what: "Zet de wekelijkse en maandelijkse taken per klant vooruit in je takenlijst.",
    when: "Telkens je de Brain of het Dashboard opent",
    rhythm: "always",
    runs: "Hub",
    proof: "tasks",
    from: ["recurring"],
    to: ["hub"],
  },

  {
    id: "backup",
    name: "Back-ups",
    what: "Bewaart de code en de gegevens van elke klantsite.",
    when: "Elke nacht",
    rhythm: "daily",
    runs: "GitHub",
    proof: "backup",
    from: ["sites", "code"],
    to: ["backup"],
  },
  {
    id: "stats",
    name: "Bezoekers en aanvragen ophalen",
    what: "Haalt bezoekerscijfers, aanvragen, afspraken en reservaties van de klantsites binnen.",
    when: "Elke ochtend rond 06:40",
    rhythm: "daily",
    runs: "Claude-taak",
    proof: "analytics",
    from: ["sites"],
    to: ["hub"],
  },
  {
    id: "alerts",
    name: "Seintjes per mail",
    what: "Nieuwe aanvragen per site, facturen die 14 dagen openstaan en klanten die achterlopen op hun video's.",
    when: "Elke dag rond 10:00, alleen als er iets is",
    rhythm: "daily",
    runs: "Hub",
    from: ["sites", "invoices", "hubdata"],
    to: ["mailYou"],
  },
  {
    id: "reminders",
    name: "Betalingsherinneringen",
    what: "Stuurt de klant elke week een herinnering zolang een factuur openstaat.",
    when: "Elke dag rond 10:00 nagekeken",
    rhythm: "daily",
    runs: "Hub",
    from: ["invoices"],
    to: ["mailClient"],
  },
  {
    id: "briefing",
    name: "Dagelijkse briefing",
    what: "Maakt de stand van alle sites op, mailt die en zet er een film van klaar.",
    when: "Elke dag rond 11:30",
    rhythm: "daily",
    runs: "Claude-taak",
    proof: "briefing",
    from: ["sites", "hubdata"],
    to: ["mailYou", "film"],
  },
  {
    id: "ledger",
    name: "Boekhouding bijwerken",
    what: "Zet betaalde facturen en kosten in het grootboek.",
    when: "Elke nacht",
    rhythm: "daily",
    runs: "Hub",
    from: ["invoices", "costs"],
    to: ["ledger"],
  },

  {
    id: "booking",
    name: "Boekingen",
    what: "Een klant boekt een gesprek: de bevestiging gaat naar de klant, de aanvraag naar jou en de afspraak naar de Agenda.",
    when: "Telkens iemand boekt",
    rhythm: "always",
    runs: "Hub",
    from: ["booking"],
    to: ["mailClient", "mailYou", "agenda"],
  },
  {
    id: "requests",
    name: "Klantaanvragen",
    what: "Een klant vraagt iets via zijn eigen link. Jij krijgt een mail en de aanvraag staat in Aanvragen, gesorteerd op prioriteit.",
    when: "Telkens een klant iets aanvraagt",
    rhythm: "always",
    runs: "Hub",
    from: ["requests"],
    to: ["mailYou", "hub"],
  },

  {
    id: "progress",
    name: "Solyn Global progress",
    what: "Film van één minuut over omzet, klanten, bereik en planning.",
    when: "Elke maandag om 07:12",
    rhythm: "weekly",
    runs: "Claude-taak",
    from: ["hubdata", "invoices"],
    to: ["film"],
  },

  {
    id: "reports",
    name: "Maandrapport per klant",
    what: "Video per klant met bezoekers, aanvragen, video's en Google Maps-posities.",
    when: "Elke 1e om 07:47",
    rhythm: "monthly",
    runs: "Claude-taak",
    yours: "Nakijken en doorsturen naar de klant",
    from: ["sites", "maps"],
    to: ["film", "hub"],
  },
  {
    id: "sitecheck",
    name: "Website-check",
    what: "Kijkt naar snelheid, back-ups, storingen, lekken in de pakketten en kapotte links. Maakt alleen een taak als er iets mis is.",
    when: "Elke 3e om 07:23",
    rhythm: "monthly",
    runs: "Claude-taak",
    yours: "Updates goedkeuren",
    from: ["sites", "code"],
    to: ["hub"],
  },
];

export const PLANNED: Planned[] = [
  {
    id: "drive-video",
    name: "Video's uit Google Drive",
    what: "Neemt foto's uit de map van de klant en maakt er met Higgsfield video's van, klaar ter controle.",
    needs: "Jouw keuze: welke klanten, budget in credits, soort video",
    stage: "wacht op jou",
  },
  {
    id: "video-plan",
    name: "Videoplanning van de maand",
    what: "Elke 1e een voorstel met de video-ideeën per klant.",
    needs: "Niets: kan gebouwd worden",
    stage: "klaar om te bouwen",
  },
  {
    id: "video-review",
    name: "Video ter controle sturen",
    what: "Zodra je een video afvinkt, staat de mail naar de klant klaar voor één klik.",
    needs: "E-mailadres van elke klant (Debleighs ontbreekt)",
    stage: "klaar om te bouwen",
  },
  {
    id: "seo-draft",
    name: "SEO-concept",
    what: "Schrijft elke maand een nieuwe pagina of Google-post als concept.",
    needs: "Jij leest na en publiceert",
    stage: "klaar om te bouwen",
  },
  {
    id: "social",
    name: "Social posts inplannen",
    what: "Teksten en planning als concept, inplannen via Metricool.",
    needs: "Accounts van de klant in Metricool en foto's",
    stage: "wacht op jou",
  },
  {
    id: "report-mail",
    name: "Maandrapport mailen",
    what: "Het rapport met één klik naar de klant sturen vanuit de klantpagina.",
    needs: "Niets: kan gebouwd worden",
    stage: "klaar om te bouwen",
  },
  {
    id: "agents",
    name: "Een agent per klant",
    what: "Een eigen assistent per klant die zijn taken, cijfers en opvolging bijhoudt.",
    needs: "Afspreken wat elke agent mag doen",
    stage: "idee",
  },
];

export const RHYTHM_LABEL: Record<Rhythm, string> = {
  always: "Doorlopend",
  daily: "Elke dag",
  weekly: "Elke week",
  monthly: "Elke maand",
};

/** "3 min geleden", "gisteren 11:52" — how long ago something last ran. */
export function ago(iso: string | null | undefined, now = Date.now()): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const min = Math.round((now - t) / 6e4);
  if (min < 1) return "zojuist";
  if (min < 60) return `${min} min geleden`;
  if (min < 24 * 60) return `${Math.round(min / 60)} uur geleden`;
  const d = Math.round(min / 1440);
  return d === 1 ? "gisteren" : `${d} dagen geleden`;
}
/** Has it run recently enough for its rhythm? null = we have no live fact for it. */
export function fresh(
  iso: string | null | undefined,
  rhythm: Rhythm,
  now = Date.now(),
): boolean | null {
  if (!iso) return null;
  const hours = (now - Date.parse(iso)) / 36e5;
  return (
    hours <=
    (rhythm === "always" ? 1 : rhythm === "daily" ? 30 : rhythm === "weekly" ? 8 * 24 : 33 * 24)
  );
}
