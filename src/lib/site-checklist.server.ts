/** Looks at a live client website and its domain to tick what the Hub can check by itself. Read-only. */
import type { AutoCheck } from "./site-checklist";

export type Found = Partial<Record<AutoCheck | "domain" | "status" | "drive", { ok: boolean; detail: string }>>;

const UA = "Mozilla/5.0 (compatible; SolynHubCheck/1.0; +https://solynglobal.be)";
async function get(url: string, ms = 10000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { redirect: "follow", signal: ctl.signal, headers: { "user-agent": UA, accept: "text/html,application/xml,text/plain,*/*" } });
    const text = (await r.text()).slice(0, 600_000);
    return { status: r.status, url: r.url, text };
  } catch (e) {
    return { status: 0, url, text: "", error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(t);
  }
}
async function dns(name: string, type: "MX" | "TXT") {
  try {
    const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`, { headers: { accept: "application/dns-json" } });
    const j = (await r.json()) as { Answer?: { data: string }[] };
    return (j.Answer ?? []).map((a) => a.data.replace(/^"|"$/g, "").replace(/" "/g, ""));
  } catch {
    return null;
  }
}

const PAGES: { check: AutoCheck; re: RegExp; label: string }[] = [
  { check: "faq", re: /faq|veelgestelde|vragen|questions/i, label: "FAQ" },
  { check: "privacy", re: /privacy|privacyverklaring|gegevensbescherming|datenschutz/i, label: "privacy" },
  { check: "voorwaarden", re: /voorwaarden|conditions|terms|cgv|agb/i, label: "voorwaarden" },
  { check: "contact", re: /contact/i, label: "contact" },
];
const HOSTED = /\.(vercel\.app|lovable\.app|netlify\.app|github\.io|pages\.dev|onrender\.com)$/i;

export async function scanSite(siteUrl: string, hub: { analytics?: boolean; drive?: boolean; status?: boolean }): Promise<Found> {
  const f: Found = {};
  const home = await get(siteUrl);
  const finalUrl = home.url || siteUrl;
  const host = (() => { try { return new URL(finalUrl).hostname; } catch { return ""; } })();
  const base = (() => { try { return new URL(finalUrl).origin; } catch { return siteUrl.replace(/\/$/, ""); } })();
  const html = home.text;

  f.home = home.status >= 200 && home.status < 400 && html.length > 200
    ? { ok: true, detail: `laadt (${home.status})` }
    : { ok: false, detail: home.status ? `antwoordt met ${home.status}` : `laadt niet: ${"error" in home ? home.error : "geen antwoord"}` };
  f.https = finalUrl.startsWith("https://") && home.status > 0 ? { ok: true, detail: "https werkt" } : { ok: false, detail: "geen werkende https" };
  f.domain = host && !HOSTED.test(host) ? { ok: true, detail: host } : { ok: false, detail: host ? `draait nog op ${host}` : "onbekend" };

  // site does not load: say so, and do not mark everything else as missing on a guess
  if (!f.home.ok) {
    if (!home.status) delete f.https;
    if (hub.status !== undefined) f.status = hub.status ? { ok: true, detail: "staat in Status" } : { ok: false, detail: "nog niet in Status" };
    if (hub.drive !== undefined) f.drive = hub.drive ? { ok: true, detail: "Drive-link ingevuld" } : { ok: false, detail: "nog geen Drive-link" };
    return f;
  }

  // pages: links in the HTML and URLs in the sitemap (single-page sites only list them there)
  const sm = await get(`${base}/sitemap.xml`);
  const smOk = sm.status === 200 && /<(urlset|sitemapindex)/i.test(sm.text);
  f.sitemap = smOk ? { ok: true, detail: `${(sm.text.match(/<loc>/gi) ?? []).length} adressen` } : { ok: false, detail: sm.status ? `antwoordt met ${sm.status}` : "niet gevonden" };
  const hrefs = [...html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map((m) => `${m[1]} ${m[2].replace(/<[^>]+>/g, " ")}`);
  const locs = smOk ? [...sm.text.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((m) => m[1]) : [];
  for (const p of PAGES) {
    const hit = [...hrefs, ...locs].find((h) => p.re.test(h));
    f[p.check] = hit ? { ok: true, detail: hit.split(" ")[0].replace(base, "") || "/" } : { ok: false, detail: `geen ${p.label}-pagina gevonden in menu of sitemap` };
  }
  if (!f.contact?.ok && /<form\b/i.test(html)) f.contact = { ok: true, detail: "formulier op de hoofdpagina" };

  const robots = await get(`${base}/robots.txt`, 6000);
  const blocksAll = /user-agent:\s*\*[\s\S]*?disallow:\s*\/\s*($|\n)/i.test(robots.text);
  f.robots = robots.status === 200 ? (blocksAll ? { ok: false, detail: "blokkeert alles (Disallow: /)" } : { ok: true, detail: "aanwezig" }) : { ok: false, detail: "geen robots.txt" };

  const title = html.match(/<title[^>]*>([^<]{3,})<\/title>/i)?.[1]?.trim();
  const desc = /<meta[^>]+name=["']description["'][^>]+content=["'][^"']{20,}/i.test(html);
  f.meta = title && desc ? { ok: true, detail: `titel: ${title.slice(0, 60)}` } : { ok: false, detail: !title ? "geen titel" : "geen meta-beschrijving" };
  const og = /<meta[^>]+property=["']og:image["']/i.test(html);
  const icon = /<link[^>]+rel=["'][^"']*icon[^"']*["']/i.test(html) || (await get(`${base}/favicon.ico`, 5000)).status === 200;
  f.og = og && icon ? { ok: true, detail: "og:image en favicon" } : { ok: false, detail: [!og && "geen og:image", !icon && "geen favicon"].filter(Boolean).join(", ") };
  f.schema = /"@type"\s*:\s*"(LocalBusiness|ProfessionalService|HomeAndConstructionBusiness|Plumber|Electrician|HairSalon|BeautySalon|Hotel|LodgingBusiness|Store|ClothingStore|MedicalBusiness|Dentist|Restaurant|SportsActivityLocation|HealthAndBeautyBusiness)"/i.test(html)
    ? { ok: true, detail: "gevonden" } : { ok: false, detail: "geen LocalBusiness-schema in de HTML" };
  f.analytics = hub.analytics || /googletagmanager|gtag\(|plausible|umami|clarity\.ms|fbq\(/i.test(html)
    ? { ok: true, detail: hub.analytics ? "gekoppeld in de Hub" : "script gevonden" } : { ok: false, detail: "geen meetscript gevonden" };
  f.cookies = /cookieyes|cookiebot|cookie-?consent|onetrust|klaro|tarteaucitron|cookie/i.test(html) || [...hrefs, ...locs].some((h) => /cookie/i.test(h))
    ? { ok: true, detail: "cookiebanner of -beleid gevonden" } : { ok: false, detail: "geen cookiebanner of -beleid gevonden" };
  f.mobile = /<meta[^>]+name=["']viewport["']/i.test(html) ? { ok: true, detail: "viewport ingesteld (snelheid niet gemeten)" } : { ok: false, detail: "geen viewport-tag" };
  const nf = await get(`${base}/solyn-check-${Date.now().toString(36)}`, 6000);
  f.notfound = nf.status === 404 ? { ok: true, detail: "geeft 404" } : { ok: false, detail: nf.status ? `onbestaande pagina geeft ${nf.status} (Google ziet dat als een echte pagina)` : "niet te controleren" };

  // e-mail on the root domain
  if (f.domain.ok) {
    const root = host.replace(/^www\./, "");
    const [mx, txt, dmarc] = await Promise.all([dns(root, "MX"), dns(root, "TXT"), dns(`_dmarc.${root}`, "TXT")]);
    if (mx !== null) {
    f.mx = mx.length ? { ok: true, detail: mx.map((m) => m.split(" ").pop()?.replace(/\.$/, "")).slice(0, 2).join(", ") } : { ok: false, detail: "geen MX-records" };
    const spf = (txt ?? []).find((t) => t.startsWith("v=spf1"));
    f.spf = spf ? { ok: true, detail: spf.slice(0, 80) } : { ok: false, detail: "geen SPF-record" };
    const dm = (dmarc ?? []).find((t) => t.startsWith("v=DMARC1"));
    f.dmarc = dm ? { ok: true, detail: dm.slice(0, 60) } : { ok: false, detail: "geen DMARC-record" };
    }
  } else {
    for (const k of ["mx", "spf", "dmarc"] as const) f[k] = { ok: false, detail: "eerst een eigen domein koppelen" };
  }
  if (hub.status !== undefined) f.status = hub.status ? { ok: true, detail: "staat in Status" } : { ok: false, detail: "nog niet in Status" };
  if (hub.drive !== undefined) f.drive = hub.drive ? { ok: true, detail: "Drive-link ingevuld" } : { ok: false, detail: "nog geen Drive-link" };
  return f;
}

/** Which checklist item each finding fills in. */
export const FOUND_TO_KEY: Record<string, string> = {
  home: "p-home", contact: "p-contact", faq: "p-faq", privacy: "p-privacy", voorwaarden: "p-voorwaarden", cookies: "p-cookies", notfound: "p-404",
  domain: "d-domein", https: "d-https", mx: "d-mail", spf: "d-spf", dmarc: "d-dmarc",
  meta: "v-meta", og: "v-og", sitemap: "v-sitemap", robots: "v-robots", schema: "v-schema", analytics: "v-analytics", mobile: "v-mobile",
  status: "o-status", drive: "o-drive",
};
