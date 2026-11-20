import { createFileRoute } from "@tanstack/react-router";

/**
 * Beheerpagina's van klantwebsites (/beheer.html op elke site): de klant past teksten en foto's aan en publiceert zelf.
 *
 *   GET  /api/public/beheer?a=content&site=riory      script: window.SITE_CONTENT = {...} (wat gepubliceerd is)
 *   GET  /api/public/beheer?a=status&site=riory       { store: true }
 *   POST /api/public/beheer?a=login    {site, code}
 *   POST /api/public/beheer?a=upload   {site, code, dataUrl}   -> { url }   (foto naar de openbare map "beheer")
 *   POST /api/public/beheer?a=publish  {site, code, content}   -> { ok, at } (live + kopie bij de versies)
 *   POST /api/public/beheer?a=history  {site, code}            -> { versions, live, liveAt }
 *   POST /api/public/beheer?a=restore  {site, code, id}        -> { ok, content }
 *
 * De toegangscode per site staat hier alleen als sha256. CORS alleen voor de eigen domeinen van elke klant.
 * Problemen melden gaat via /api/public/request (aanvraag + taak + mail).
 */
const SITES: Record<string, { hash: string; origins: RegExp[] }> = {
  riory: { hash: "783babcd9c9e98bc2f44d328c8620639fccdfe065f3d48940f2190f01bcc8b2d", origins: [/^https:\/\/(www\.)?riory\.be$/, /^https:\/\/riory(-[a-z0-9-]+)?\.vercel\.app$/] },
  "villa-amano": { hash: "0d11a45eb6b9b9ff75e27eef4bfb63283436b6cb2d7066b60ecc483d5ca86d43", origins: [/^https:\/\/(www\.)?villa-amano\.com$/, /^https:\/\/hotel-bilzen(-[a-z0-9-]+)?\.vercel\.app$/] },
  belgomed: { hash: "119ea0f6c6e6b0c0aebcd456c9955be3a795f366a6dadc14f9b9fe45f7d4c20e", origins: [/^https:\/\/(www\.)?belgomed\.(com|be)$/, /^https:\/\/belgomed(-v2)?(-[a-z0-9-]+)?\.(vercel|lovable)\.app$/] },
  "horsey-valley": { hash: "d109c5e102e4f2c97ba523c9ce2e0e38ec98287b3a55d676e47da1990737ac1e", origins: [/^https:\/\/(www\.)?horseyvalley\.be$/, /^https:\/\/(horsevally\.lovable|horse-valley-retreat(-[a-z0-9-]+)?\.vercel)\.app$/] },
  dynamik: { hash: "3deaa8281e67889b20c3153a91b75b03d52a0b5b9f0fb8d6971cc3b5e6f31354", origins: [/^https:\/\/dynamik(-[a-z0-9-]+)?\.vercel\.app$/] },
  tcsc: { hash: "29048365e1a990513a72acbc2bfee94f3965b88e45d7e2c51f43f88fe1816b19", origins: [/^https:\/\/(www\.)?tcsc\.be$/, /^https:\/\/tcsv(-[a-z0-9-]+)?\.vercel\.app$/] },
};
const BUCKET = "beheer";

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
async function okCode(site: string, code: unknown): Promise<boolean> {
  if (!SITES[site] || typeof code !== "string") return false;
  const h = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code.trim().toLowerCase())));
  const want = SITES[site].hash;
  let diff = h.length ^ want.length;
  for (let i = 0; i < Math.min(h.length, want.length); i++) diff |= h.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}
function cors(request: Request, site: string | null): Record<string, string> {
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
const json = (h: Record<string, string>, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...h } });

type Content = { text: Record<string, string>; img: Record<string, string> };
function validContent(c: unknown, site: string): string | null {
  if (!c || typeof c !== "object" || Array.isArray(c)) return "Geen geldige inhoud.";
  const o = c as Record<string, unknown>;
  for (const k of Object.keys(o)) if (k !== "text" && k !== "img") return "Onbekend onderdeel: " + k;
  const text = (o.text ?? {}) as Record<string, unknown>, img = (o.img ?? {}) as Record<string, unknown>;
  if (typeof text !== "object" || typeof img !== "object") return "Geen geldige inhoud.";
  if (Object.keys(text).length > 3000 || Object.keys(img).length > 500) return "Te veel wijzigingen in één keer.";
  for (const [k, v] of Object.entries(text)) if (typeof v !== "string" || k.length > 6000 || v.length > 6000) return "Een tekst is te lang.";
  const imgOk = new RegExp("^https://[a-z0-9.-]+/storage/v1/object/public/" + BUCKET + "/" + site + "/img/[a-f0-9]{16}\\.(jpg|png|webp)$");
  for (const [k, v] of Object.entries(img)) {
    if (typeof v !== "string" || k.length > 500) return "Ongeldige foto.";
    if (/^data:/i.test(v)) return "Er staan nog foto’s in die niet geüpload zijn.";
    if (!imgOk.test(v)) return "Ongeldige foto.";
  }
  if (JSON.stringify(c).length > 900000) return "De wijzigingen zijn te groot.";
  return null;
}

export const Route = createFileRoute("/api/public/beheer")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, { status: 204, headers: cors(request, new URL(request.url).searchParams.get("site")) }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const a = url.searchParams.get("a"), site = url.searchParams.get("site") ?? "";
        if (a === "status") return json(cors(request, site), { store: true, site: !!SITES[site] });
        if (a !== "content") return json({}, { error: "Onbekende actie." }, 400);
        let content: unknown = null;
        if (SITES[site]) {
          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data } = await (supabaseAdmin as any).from("beheer_content").select("content").eq("site", site).maybeSingle();
            content = data?.content ?? null;
          } catch (e) {
            console.error("[beheer] content", e instanceof Error ? e.message : e);
          }
        }
        const body = content
          ? "window.SITE_CONTENT = " + JSON.stringify(content).replace(/</g, "\\u003c") + ";\n"
          : "/* geen gepubliceerde wijzigingen */\n";
        return new Response(body, {
          headers: {
            "content-type": "application/javascript; charset=utf-8",
            "access-control-allow-origin": "*",
            "cache-control": "public, max-age=0, s-maxage=20, stale-while-revalidate=600",
          },
        });
      },
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const a = url.searchParams.get("a");
        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return json({}, { error: "Ongeldig verzoek." }, 400);
        }
        const site = String(url.searchParams.get("site") || body.site || "");
        const h = cors(request, site);
        if (!SITES[site]) return json(h, { error: "Onbekende website." }, 404);
        if (!(await okCode(site, body.code))) return json(h, { error: "De toegangscode klopt niet." }, 401);
        if (a === "login") return json(h, { ok: true, store: true });
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const db = supabaseAdmin as any;
          if (a === "upload") {
            const m = /^data:(image\/(jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(body.dataUrl || ""));
            if (!m) return json(h, { error: "Dit is geen geldige foto." }, 400);
            const bin = Uint8Array.from(atob(m[3]), (c) => c.charCodeAt(0));
            if (bin.length > 3.5 * 1024 * 1024) return json(h, { error: "Deze foto is te groot." }, 413);
            const ext = m[2] === "jpeg" ? "jpg" : m[2];
            const name = site + "/img/" + hex(await crypto.subtle.digest("SHA-1", bin)).slice(0, 16) + "." + ext;
            const up = await supabaseAdmin.storage.from(BUCKET).upload(name, bin, { contentType: m[1], upsert: true, cacheControl: "31536000" });
            if (up.error) throw new Error(up.error.message);
            return json(h, { url: supabaseAdmin.storage.from(BUCKET).getPublicUrl(name).data.publicUrl });
          }
          if (a === "publish") {
            const err = validContent(body.content, site);
            if (err) return json(h, { error: err }, 400);
            const c = body.content as Partial<Content>;
            const content: Content = { text: c.text ?? {}, img: c.img ?? {} };
            const at = new Date().toISOString();
            const v = await db.from("beheer_versions").insert({ site, content });
            if (v.error) throw new Error(v.error.message);
            const live = await db.from("beheer_content").upsert({ site, content, published_at: at });
            if (live.error) throw new Error(live.error.message);
            return json(h, { ok: true, at });
          }
          if (a === "history") {
            const { data: versions } = await db.from("beheer_versions").select("id, created_at").eq("site", site).order("created_at", { ascending: false }).limit(15);
            const { data: live } = await db.from("beheer_content").select("content, published_at").eq("site", site).maybeSingle();
            return json(h, {
              versions: (versions ?? []).map((x: { id: string; created_at: string }) => ({ pathname: x.id, at: x.created_at })),
              live: live?.content ?? null,
              liveAt: live?.published_at ?? null,
            });
          }
          if (a === "restore") {
            const id = String(body.pathname || "");
            const { data: v } = await db.from("beheer_versions").select("content").eq("site", site).eq("id", id).maybeSingle();
            if (!v) return json(h, { error: "Die versie bestaat niet meer." }, 404);
            const at = new Date().toISOString();
            await db.from("beheer_versions").insert({ site, content: v.content });
            const live = await db.from("beheer_content").upsert({ site, content: v.content, published_at: at });
            if (live.error) throw new Error(live.error.message);
            return json(h, { ok: true, content: v.content });
          }
          return json(h, { error: "Onbekende actie." }, 400);
        } catch (e) {
          console.error("[beheer]", a, site, e instanceof Error ? e.message : e);
          return json(h, { error: a === "upload" ? "Uploaden mislukt. Probeer het opnieuw." : "Dat lukte niet. Probeer het zo meteen opnieuw." }, 500);
        }
      },
    },
  },
});
