/** Launch checklist for a client website. Items with `auto` can be checked by the Hub itself. */

export type Group = "paginas" | "domein" | "vindbaarheid" | "overdracht";
export type AutoCheck =
  | "home" | "contact" | "faq" | "privacy" | "voorwaarden" | "cookies" | "notfound"
  | "https" | "mx" | "spf" | "dmarc" | "favicon" | "og" | "meta" | "sitemap" | "robots" | "schema" | "analytics" | "mobile";

export type Item = { key: string; label: string; hint?: string; group: Group; auto?: AutoCheck };

export const GROUPS: { id: Group; label: string }[] = [
  { id: "paginas", label: "Pagina's" },
  { id: "domein", label: "Domein en e-mail" },
  { id: "vindbaarheid", label: "Vindbaarheid" },
  { id: "overdracht", label: "Oplevering" },
];

export const TEMPLATE: Item[] = [
  { key: "p-home", group: "paginas", label: "Hoofdpagina", auto: "home" },
  { key: "p-diensten", group: "paginas", label: "Diensten of aanbod" },
  { key: "p-over", group: "paginas", label: "Over ons" },
  { key: "p-contact", group: "paginas", label: "Contactpagina met formulier", auto: "contact" },
  { key: "p-faq", group: "paginas", label: "FAQ-pagina", auto: "faq" },
  { key: "p-privacy", group: "paginas", label: "Privacybeleid", hint: "GDPR: verplicht zodra je een formulier of tracking hebt", auto: "privacy" },
  { key: "p-voorwaarden", group: "paginas", label: "Algemene voorwaarden", auto: "voorwaarden" },
  { key: "p-cookies", group: "paginas", label: "Cookiebeleid en cookiebanner", auto: "cookies" },
  { key: "p-404", group: "paginas", label: "Eigen 404-pagina", auto: "notfound" },
  { key: "p-gegevens", group: "paginas", label: "Bedrijfsgegevens in de footer", hint: "naam, adres, ondernemingsnummer, telefoon, e-mail" },

  { key: "d-domein", group: "domein", label: "Domeinnaam verbonden" },
  { key: "d-https", group: "domein", label: "Beveiligd (https, geldig certificaat)", auto: "https" },
  { key: "d-www", group: "domein", label: "www en zonder www komen op dezelfde site" },
  { key: "d-mail", group: "domein", label: "E-mailadres verbonden (MX)", auto: "mx" },
  { key: "d-spf", group: "domein", label: "SPF ingesteld", hint: "zodat mails van de klant niet in spam belanden", auto: "spf" },
  { key: "d-dmarc", group: "domein", label: "DMARC ingesteld", auto: "dmarc" },
  { key: "d-form", group: "domein", label: "Contactformulier getest: mail komt aan" },

  { key: "v-meta", group: "vindbaarheid", label: "Titel en meta-beschrijving per pagina", auto: "meta" },
  { key: "v-og", group: "vindbaarheid", label: "Deelafbeelding (Open Graph) en favicon", auto: "og" },
  { key: "v-sitemap", group: "vindbaarheid", label: "sitemap.xml", auto: "sitemap" },
  { key: "v-robots", group: "vindbaarheid", label: "robots.txt laat Google toe", auto: "robots" },
  { key: "v-schema", group: "vindbaarheid", label: "LocalBusiness-schema", auto: "schema" },
  { key: "v-gsc", group: "vindbaarheid", label: "Google Search Console + sitemap ingediend" },
  { key: "v-gbp", group: "vindbaarheid", label: "Google Bedrijfsprofiel gekoppeld aan de site" },
  { key: "v-analytics", group: "vindbaarheid", label: "Bezoekers meten (analytics)", auto: "analytics" },
  { key: "v-mobile", group: "vindbaarheid", label: "Mobiel nagekeken en snel", auto: "mobile" },

  { key: "o-teksten", group: "overdracht", label: "Klant akkoord met teksten en foto's" },
  { key: "o-status", group: "overdracht", label: "Site in de Hub-statuscheck (uptime, back-up)" },
  { key: "o-beheer", group: "overdracht", label: "Beheerpagina voor de klant klaar" },
  { key: "o-drive", group: "overdracht", label: "Drive-map met alle bestanden" },
  { key: "o-hosting", group: "overdracht", label: "Hosting-abonnement gefactureerd" },
];

export type Row = {
  key: string;
  label: string | null;
  grp: string | null;
  state: "open" | "klaar" | "nvt";
  note: string | null;
  auto_state: "ok" | "mis" | null;
  auto_detail: string | null;
  auto_at: string | null;
};

export type View = Item & { state: Row["state"]; note: string | null; auto_state: Row["auto_state"]; auto_detail: string | null; custom: boolean };

/** Template + extra items, merged with what is saved. A ticked item stays ticked; an automatic "ok" counts as done. */
export function merge(rows: Row[]): View[] {
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const base: View[] = TEMPLATE.map((t) => {
    const r = byKey.get(t.key);
    return { ...t, state: r?.state ?? "open", note: r?.note ?? null, auto_state: r?.auto_state ?? null, auto_detail: r?.auto_detail ?? null, custom: false };
  });
  const extra: View[] = rows
    .filter((r) => r.key.startsWith("x-") && r.label)
    .map((r) => ({ key: r.key, label: r.label!, group: (r.grp as Group) || "overdracht", state: r.state, note: r.note, auto_state: null, auto_detail: null, custom: true }));
  return [...base, ...extra];
}

export const isDone = (v: Pick<View, "state" | "auto_state">) => v.state === "klaar" || (v.state === "open" && v.auto_state === "ok");

export function progress(items: View[]) {
  const counted = items.filter((v) => v.state !== "nvt");
  const done = counted.filter(isDone).length;
  return { done, total: counted.length, pct: counted.length ? Math.round((done / counted.length) * 100) : 0 };
}
