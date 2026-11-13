// Pure helpers for cookieless visitor counting. Tested in visits.test.ts.

const BOT_RE =
  /bot|crawl|spider|slurp|preview|fetch|headless|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|curl|wget|python|axios|node-fetch|go-http|java\/|facebookexternalhit|whatsapp|telegram|discord|slack|SolynStatusHub/i;

export function isBot(userAgent: string | null | undefined): boolean {
  if (!userAgent || userAgent.length < 20) return true;
  return BOT_RE.test(userAgent);
}

/** Path without query string or hash, max 200 chars, always starting with "/". */
export function normalizePath(raw: unknown): string {
  if (typeof raw !== "string" || !raw) return "/";
  let p = raw;
  try {
    p = new URL(raw, "https://x.invalid").pathname;
  } catch {
    p = raw.split(/[?#]/)[0];
  }
  if (!p.startsWith("/")) p = "/" + p;
  if (p.length > 1) p = p.replace(/\/+$/, "") || "/";
  return decodeSafe(p).slice(0, 200);
}

function decodeSafe(s: string) {
  try {
    return decodeURI(s);
  } catch {
    return s;
  }
}

const SOURCES: Array<[RegExp, string]> = [
  [/(^|\.)google\./, "Google"],
  [/(^|\.)bing\.com$/, "Bing"],
  [/duckduckgo\.com$/, "DuckDuckGo"],
  [/(^|\.)(facebook\.com|fb\.com|m\.facebook\.com|l\.facebook\.com)$/, "Facebook"],
  [/(^|\.)instagram\.com$/, "Instagram"],
  [/(^|\.)linkedin\.com$|lnkd\.in$/, "LinkedIn"],
  [/(^|\.)(t\.co|twitter\.com|x\.com)$/, "X"],
  [/(^|\.)tiktok\.com$/, "TikTok"],
  [/(^|\.)youtube\.com$/, "YouTube"],
  [/chatgpt\.com$|openai\.com$/, "ChatGPT"],
  [/(^|\.)claude\.ai$/, "Claude"],
  [/perplexity\.ai$/, "Perplexity"],
];

/** Where the visit came from: utm_source, a known referrer, another site, or "Direct". */
export function sourceOf(referrer: unknown, pageUrl: unknown): string {
  try {
    if (typeof pageUrl === "string") {
      const utm = new URL(pageUrl).searchParams.get("utm_source");
      if (utm) return utm.toLowerCase().slice(0, 60);
    }
  } catch {
    /* ignore */
  }
  if (typeof referrer !== "string" || !referrer) return "Direct";
  let host = "";
  try {
    host = new URL(referrer).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "Direct";
  }
  let own = "";
  try {
    own =
      typeof pageUrl === "string"
        ? new URL(pageUrl).hostname.replace(/^www\./, "").toLowerCase()
        : "";
  } catch {
    /* ignore */
  }
  if (!host || host === own) return "Direct";
  for (const [re, name] of SOURCES) if (re.test(host)) return name;
  return host.slice(0, 100);
}

/** Daily-rotating visitor hash: sha256(secret | day | tracking id | ip | user agent). */
export async function visitorHash(
  secret: string,
  day: string,
  trackingId: string,
  ip: string,
  ua: string,
): Promise<string> {
  const data = new TextEncoder().encode(`${secret}|${day}|${trackingId}|${ip}|${ua}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type VisitDay = { day: string; pageviews: number; visitors: number };

/** Totals for today, the last 7 and 30 days, and all time. */
export function visitTotals(
  rows: VisitDay[],
  today: string,
  shift: (iso: string, n: number) => string,
) {
  const sum = (since: string) =>
    rows
      .filter((r) => r.day >= since && r.day <= today)
      .reduce(
        (a, r) => ({ visitors: a.visitors + r.visitors, pageviews: a.pageviews + r.pageviews }),
        { visitors: 0, pageviews: 0 },
      );
  return {
    today: sum(today),
    week: sum(shift(today, -6)),
    month: sum(shift(today, -29)),
    all: sum("0000-01-01"),
  };
}
