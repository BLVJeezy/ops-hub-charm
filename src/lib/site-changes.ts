/**
 * What a client changed on their website through their beheerpagina, field by field: where, what (before → after) and how.
 * Plus the red flags: SEO-sensitive edits, contact details (name, address, phone must match Google), lots of text removed,
 * and too many changes at once or in one day.
 */
export type SiteContent = {
  text?: Record<string, string>;
  img?: Record<string, string>;
  contact?: Record<string, { t: string; f: string; v: string }>;
};
/** Optional hints the beheerpagina can send per key: on which page and in which element the text sits. */
export type Where = Record<string, { page?: string; tag?: string }>;

export type FieldKind = "text" | "img" | "contact";
export type Change = {
  kind: FieldKind;
  key: string;
  page: string | null;
  tag: string | null;
  before: string | null;
  after: string | null;
  seo: boolean;
  why: string[];
};
export type Flag = "seo" | "contact" | "removed" | "many-at-once" | "many-today";
export const FLAG_LABEL: Record<Flag, string> = {
  seo: "SEO aangepast",
  contact: "Contactgegevens",
  removed: "Veel tekst weg",
  "many-at-once": "Veel tegelijk",
  "many-today": "Veel vandaag",
};
/** Thresholds for "too much". */
export const LIMITS = { atOnce: 25, perDay: 60, publishesPerDay: 6 };

// elements that search engines weigh most
const SEO_TAGS = new Set([
  "title",
  "meta",
  "meta-description",
  "description",
  "h1",
  "h2",
  "h3",
  "alt",
  "a",
  "href",
  "slug",
  "canonical",
  "og:title",
  "og:description",
]);

/**
 * The text a field shows right now: the client's value if set, else the original (the key is the original text).
 * For images the key is the original image address.
 */
const shown = (map: Record<string, string> | undefined, key: string) =>
  map && key in map ? map[key] : key;

export function diffContent(
  prev: SiteContent | null,
  next: SiteContent,
  where: Where = {},
): Change[] {
  const out: Change[] = [];
  const p = prev ?? {};
  for (const kind of ["text", "img"] as const) {
    const a = p[kind] ?? {},
      b = next[kind] ?? {};
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const before = shown(a, key),
        after = shown(b, key);
      if (before === after) continue;
      const w = where[key] ?? {};
      const tag = w.tag?.toLowerCase() ?? null;
      const why: string[] = [];
      if (kind === "text") {
        if (tag && SEO_TAGS.has(tag))
          why.push(
            `${tag === "title" ? "paginatitel" : tag === "meta-description" || tag === "description" ? "omschrijving voor Google" : tag.toUpperCase()} aangepast`,
          );
        const lb = before.trim().length,
          la = after.trim().length;
        if (lb >= 40 && la < lb * 0.4)
          why.push(`${Math.round((1 - la / lb) * 100)}% van de tekst weg`);
        if (
          /(https?:\/\/|\/[a-z0-9-]+\.html)/i.test(before) &&
          before !== after &&
          /(https?:\/\/|\.html)/i.test(after + before)
        )
          why.push("link aangepast");
      }
      if (kind === "img" && tag === "alt") why.push("alt-tekst aangepast");
      out.push({
        kind,
        key,
        page: w.page ?? null,
        tag,
        before: kind === "img" && !(key in a) ? key : before,
        after,
        seo: why.length > 0,
        why,
      });
    }
  }
  const ca = p.contact ?? {},
    cb = next.contact ?? {};
  for (const key of new Set([...Object.keys(ca), ...Object.keys(cb)])) {
    const before = ca[key]?.v ?? null,
      after = cb[key]?.v ?? null;
    if (before === after) continue;
    out.push({
      kind: "contact",
      key: cb[key]?.f || ca[key]?.f || key,
      page: null,
      tag: cb[key]?.t ?? ca[key]?.t ?? null,
      before,
      after,
      seo: true,
      why: ["contactgegevens: moeten overeenkomen met Google"],
    });
  }
  return out;
}

/** Flags for one publish, given how many fields and publishes the site already had in the last 24 hours. */
export function flagsFor(
  changes: Change[],
  today: { fields: number; publishes: number } = { fields: 0, publishes: 0 },
): Flag[] {
  const f = new Set<Flag>();
  for (const c of changes) {
    if (c.kind === "contact") f.add("contact");
    else if (c.why.some((w) => w.includes("tekst weg"))) f.add("removed");
    if (c.seo && c.kind !== "contact" && c.why.some((w) => !w.includes("tekst weg"))) f.add("seo");
  }
  if (changes.length > LIMITS.atOnce) f.add("many-at-once");
  if (today.fields + changes.length > LIMITS.perDay || today.publishes + 1 > LIMITS.publishesPerDay)
    f.add("many-today");
  return [...f];
}

/** A short line for a mail or a notification. */
export function summary(site: string, changes: Change[], flags: Flag[]): string {
  const n = changes.length;
  return `${site}: ${n} ${n === 1 ? "aanpassing" : "aanpassingen"}${flags.length ? ` · ${flags.map((x) => FLAG_LABEL[x]).join(", ")}` : ""}`;
}
