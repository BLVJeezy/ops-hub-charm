/**
 * Klantwebsites met een beheerpagina (/beheer.html). Gedeeld door /api/public/beheer en /api/public/support.
 * De toegangscode staat hier alleen als sha256. clientId koppelt aan de klant in de Hub (null = geen Hub-klant).
 */
export type BeheerSite = {
  name: string;
  hash: string;
  origins: RegExp[];
  clientId: string | null;
  home: string;
  beheer: string;
  /** Eigenaar ingelogd in dit operations center (Bearer-token) mag het beheer openen zonder code. */
  ops?: string;
  /** Geen toegangscode: iedereen met de link mag het beheer openen (op vraag van Solyn). */
  open?: boolean;
};
export const SITES: Record<string, BeheerSite> = {
  riory: {
    name: "Riory",
    hash: "a0f8e6217a2f5190b0924f8913d80db600f109ba2a862399dadcb51a64299e50",
    origins: [/^https:\/\/(www\.)?riory\.be$/, /^https:\/\/riory(-[a-z0-9-]+)?\.vercel\.app$/],
    clientId: "da40aea1-1cee-4347-8464-9dd738edcd10",
    home: "https://www.riory.be",
    beheer: "https://www.riory.be/beheer.html",
  },
  "villa-amano": {
    name: "Villa Amano",
    hash: "fc9accdda8b545376590eb750bbc8e63d2ff2b2fa72d89672b5be8d07877e2d3",
    origins: [
      /^https:\/\/(www\.)?villa-amano\.com$/,
      /^https:\/\/hotel-bilzen(-[a-z0-9-]+)?\.vercel\.app$/,
    ],
    clientId: "a06b8ec3-ff78-4a14-9c5b-52c570c31d0a",
    home: "https://hotel-bilzen.vercel.app",
    beheer: "https://hotel-bilzen.vercel.app/beheer.html",
    ops: "https://hotel-bilzen.vercel.app/api/ops",
  },
  belgomed: {
    name: "Belgomed",
    hash: "490fc070fc5642d10cf5630e8db1bbebe8025c88a218e7bf289f9cca9e1a87cf",
    origins: [
      /^https:\/\/(www\.)?belgomed\.(com|be)$/,
      /^https:\/\/belgomed(-v2)?(-[a-z0-9-]+)?\.(vercel|lovable)\.app$/,
    ],
    clientId: "7cf293ec-d975-4761-8f50-e69148be3ff6",
    home: "https://belgomed.com",
    beheer: "https://belgomed.com/beheer.html",
  },
  nuance: {
    name: "Nuance",
    // zelfde klant als Villa Amano (open, geen code nodig)
    hash: "fc9accdda8b545376590eb750bbc8e63d2ff2b2fa72d89672b5be8d07877e2d3",
    origins: [/^https:\/\/(www\.)?nuance-therapie\.be$/, /^https:\/\/nuance-therapy(-[a-z0-9-]+)?\.vercel\.app$/],
    clientId: "1b0c6a00-21d0-4206-8315-bbe8027a1e54",
    home: "https://nuance-therapy.vercel.app",
    beheer: "https://nuance-therapy.vercel.app/beheer.html",
    ops: "https://hotel-bilzen.vercel.app/api/ops",
    open: true,
  },
  "horsey-valley": {
    name: "Horsey Valley",
    hash: "d109c5e102e4f2c97ba523c9ce2e0e38ec98287b3a55d676e47da1990737ac1e",
    origins: [
      /^https:\/\/(www\.)?horseyvalley\.be$/,
      /^https:\/\/(horsevally\.lovable|horse-valley-retreat(-[a-z0-9-]+)?\.vercel)\.app$/,
    ],
    clientId: null,
    home: "https://horseyvalley.be",
    beheer: "https://horseyvalley.be/beheer.html",
  },
  dynamik: {
    name: "DynaMik",
    hash: "3deaa8281e67889b20c3153a91b75b03d52a0b5b9f0fb8d6971cc3b5e6f31354",
    origins: [/^https:\/\/dynamik(-[a-z0-9-]+)?\.vercel\.app$/],
    clientId: "08224ba1-4f18-4312-bc86-7c2e8d73d8d3",
    home: "https://dynamik-delta.vercel.app",
    beheer: "https://dynamik-delta.vercel.app/beheer.html",
  },
  tcsc: {
    name: "TCSC",
    hash: "29048365e1a990513a72acbc2bfee94f3965b88e45d7e2c51f43f88fe1816b19",
    origins: [/^https:\/\/(www\.)?tcsc\.be$/, /^https:\/\/tcsv(-[a-z0-9-]+)?\.vercel\.app$/],
    clientId: null,
    home: "https://tcsv.vercel.app",
    beheer: "https://tcsv.vercel.app/beheer.html",
  },
};

const hex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

/** Solyn's own master code: opens the beheer of every site (only its sha256 is stored here). */
const MASTER = "5f110b05d440ba90a0abc8ebdba5290df0ad522345b8b8ff65cb65c016598a16";
const same = (a: string, b: string) => {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.min(a.length, b.length); i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};
/** Checks a site's access code (the plain name, lower case) or the master code against their sha256, in constant time. */
/** "ops:<token>": the owner is logged in to the site's operations center; that center confirms who it is. */
async function okOps(site: string, token: string): Promise<boolean> {
  const url = SITES[site]?.ops;
  if (!url || !/^[A-Za-z0-9._-]{20,2000}$/.test(token)) return false;
  try {
    const r = await fetch(url + "?a=me", { headers: { authorization: "Bearer " + token }, signal: AbortSignal.timeout(6000) });
    if (!r.ok) return false;
    const j = (await r.json()) as { user?: { role?: string; id?: string } };
    return j.user?.role === "owner" && j.user?.id !== "demo-owner";
  } catch {
    return false;
  }
}
export async function okCode(site: string, code: unknown): Promise<boolean> {
  if (SITES[site]?.open) return true;
  if (!SITES[site] || typeof code !== "string") return false;
  if (code.startsWith("ops:")) return okOps(site, code.slice(4).trim());
  const h = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code.trim().toLowerCase())));
  return same(h, SITES[site].hash) || same(h, MASTER);
}

/** CORS headers only for the site's own domains. */
export function siteCors(request: Request, site: string | null): Record<string, string> {
  const o = request.headers.get("origin") ?? "";
  if (!o || !site || !SITES[site] || !SITES[site].origins.some((re) => re.test(o))) return {};
  return {
    "access-control-allow-origin": o,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

/** Which site sent a request, by its Origin header. */
export function siteForOrigin(origin: string | null): string | null {
  if (!origin) return null;
  for (const [slug, s] of Object.entries(SITES))
    if (s.origins.some((re) => re.test(origin))) return slug;
  return null;
}
