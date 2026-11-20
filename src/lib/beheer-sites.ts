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
};
export const SITES: Record<string, BeheerSite> = {
  riory: {
    name: "Riory",
    hash: "783babcd9c9e98bc2f44d328c8620639fccdfe065f3d48940f2190f01bcc8b2d",
    origins: [/^https:\/\/(www\.)?riory\.be$/, /^https:\/\/riory(-[a-z0-9-]+)?\.vercel\.app$/],
    clientId: "da40aea1-1cee-4347-8464-9dd738edcd10",
    home: "https://www.riory.be",
    beheer: "https://www.riory.be/beheer.html",
  },
  "villa-amano": {
    name: "Villa Amano",
    hash: "0d11a45eb6b9b9ff75e27eef4bfb63283436b6cb2d7066b60ecc483d5ca86d43",
    origins: [/^https:\/\/(www\.)?villa-amano\.com$/, /^https:\/\/hotel-bilzen(-[a-z0-9-]+)?\.vercel\.app$/],
    clientId: "a06b8ec3-ff78-4a14-9c5b-52c570c31d0a",
    home: "https://www.villa-amano.com",
    beheer: "https://www.villa-amano.com/beheer.html",
  },
  belgomed: {
    name: "Belgomed",
    hash: "119ea0f6c6e6b0c0aebcd456c9955be3a795f366a6dadc14f9b9fe45f7d4c20e",
    origins: [/^https:\/\/(www\.)?belgomed\.(com|be)$/, /^https:\/\/belgomed(-v2)?(-[a-z0-9-]+)?\.(vercel|lovable)\.app$/],
    clientId: "7cf293ec-d975-4761-8f50-e69148be3ff6",
    home: "https://belgomed.com",
    beheer: "https://belgomed.com/beheer.html",
  },
  "horsey-valley": {
    name: "Horsey Valley",
    hash: "d109c5e102e4f2c97ba523c9ce2e0e38ec98287b3a55d676e47da1990737ac1e",
    origins: [/^https:\/\/(www\.)?horseyvalley\.be$/, /^https:\/\/(horsevally\.lovable|horse-valley-retreat(-[a-z0-9-]+)?\.vercel)\.app$/],
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

/** Checks a site's access code (the plain name, lower case) against its stored sha256, in constant time. */
export async function okCode(site: string, code: unknown): Promise<boolean> {
  if (!SITES[site] || typeof code !== "string") return false;
  const h = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code.trim().toLowerCase())));
  const want = SITES[site].hash;
  let diff = h.length ^ want.length;
  for (let i = 0; i < Math.min(h.length, want.length); i++) diff |= h.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
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
  for (const [slug, s] of Object.entries(SITES)) if (s.origins.some((re) => re.test(origin))) return slug;
  return null;
}
