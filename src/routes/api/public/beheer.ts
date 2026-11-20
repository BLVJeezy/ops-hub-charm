import { createFileRoute } from "@tanstack/react-router";
import { SITES, okCode, siteCors as cors } from "@/lib/beheer-sites";
import { logSiteChanges } from "@/lib/site-changes.server";
import type { SiteContent, Where } from "@/lib/site-changes";

/**
 * Beheerpagina's van klantwebsites (/beheer.html op elke site): de klant past teksten en foto's aan en publiceert zelf.
 *
 *   GET  /api/public/beheer?a=content&site=riory      script: window.SITE_CONTENT = {...} (wat gepubliceerd is)
 *   GET  /api/public/beheer?a=status&site=riory       { store: true }
 *   POST /api/public/beheer?a=login    {site, code}
 *   POST /api/public/beheer?a=upload   {site, code, dataUrl}   -> { url }   (foto naar de openbare map "beheer")
 *   POST /api/public/beheer?a=publish  {site, code, content, where?} -> { ok, at } (live + kopie bij de versies)
 *        where (optioneel): { [sleutel]: { page: "/diensten", tag: "h1" } }, dan toont het wijzigingslog pagina en element.
 *        Elke publicatie komt in Wijzigingen in de Hub (waar, wat, hoe), met rode vlaggen voor SEO, contactgegevens en te veel ineens.
 *   POST /api/public/beheer?a=save     {site, code, content}   -> { ok, at } (alleen bewaard als versie, niet live)
 *   POST /api/public/beheer?a=load     {site, code, pathname}  -> { content } (een versie openen om verder te werken)
 *   POST /api/public/beheer?a=history  {site, code}            -> { versions: [{pathname, at, kind}], live, liveAt }
 *   POST /api/public/beheer?a=restore  {site, code, id}        -> { ok, content }
 *
 * De toegangscode per site staat hier alleen als sha256. CORS alleen voor de eigen domeinen van elke klant.
 * Problemen melden gaat via /api/public/request (aanvraag + taak + mail).
 */
const BUCKET = "beheer";

/** What is live right now, and the version it came from: the "before" for the change log. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function liveBefore(db: any, site: string) {
  const [{ data: live }, { data: last }] = await Promise.all([
    db.from("beheer_content").select("content").eq("site", site).maybeSingle(),
    db
      .from("beheer_versions")
      .select("id")
      .eq("site", site)
      .eq("kind", "published")
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  return {
    content: (live?.content ?? null) as SiteContent | null,
    versionId: (last?.[0]?.id ?? null) as string | null,
  };
}
/** Optional `where` from the beheerpagina: { [key]: { page, tag } } so the log can say on which page and in which element. */
function whereHints(w: unknown): Where {
  if (!w || typeof w !== "object" || Array.isArray(w)) return {};
  const out: Where = {};
  for (const [k, v] of Object.entries(w as Record<string, unknown>).slice(0, 3000)) {
    if (!v || typeof v !== "object") continue;
    const x = v as Record<string, unknown>;
    out[k] = {
      page: typeof x.page === "string" ? x.page.slice(0, 200) : undefined,
      tag: typeof x.tag === "string" ? x.tag.slice(0, 40) : undefined,
    };
  }
  return out;
}
const hex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

const json = (h: Record<string, string>, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...h,
    },
  });

type Contact = Record<string, { t: "phone" | "email" | "text" | "url"; f: string; v: string }>;
type Style = { head?: string; body?: string; el?: Record<string, { f?: string; s?: number }> };
type Content = { text: Record<string, string>; img: Record<string, string>; contact?: Contact; style?: Style };
function validContent(c: unknown, site: string): string | null {
  if (!c || typeof c !== "object" || Array.isArray(c)) return "Geen geldige inhoud.";
  const o = c as Record<string, unknown>;
  for (const k of Object.keys(o))
    if (k !== "text" && k !== "img" && k !== "contact" && k !== "style") return "Onbekend onderdeel: " + k;
  if (o.style !== undefined) {
    const st = o.style as Record<string, unknown>;
    const font = (v: unknown) => v === undefined || (typeof v === "string" && /^[A-Za-z0-9 ]{1,60}$/.test(v));
    if (!st || typeof st !== "object" || Array.isArray(st) || !font(st.head) || !font(st.body)) return "Ongeldige lettertypes.";
    const el = (st.el ?? {}) as Record<string, unknown>;
    if (typeof el !== "object" || Array.isArray(el) || Object.keys(el).length > 400) return "Ongeldige lettertypes.";
    for (const [k, v] of Object.entries(el)) {
      const x = v as Record<string, unknown>;
      if (k.length > 300 || !x || typeof x !== "object" || !font(x.f)) return "Ongeldige lettertypes.";
      if (x.s !== undefined && (typeof x.s !== "number" || x.s < 50 || x.s > 300)) return "Ongeldige tekstgrootte.";
    }
  }
  if (o.contact !== undefined) {
    const c = o.contact as Record<string, unknown>;
    if (!c || typeof c !== "object" || Array.isArray(c) || Object.keys(c).length > 12)
      return "Ongeldige contactgegevens.";
    for (const [k, v] of Object.entries(c)) {
      const x = v as Record<string, unknown>;
      if (k.length > 40 || !x || typeof x !== "object") return "Ongeldige contactgegevens.";
      if (!["phone", "email", "text", "url"].includes(String(x.t))) return "Ongeldige contactgegevens.";
      if (x.t === "url" && typeof x.v === "string" && !/^https:\/\/[^\s"'<>]+$/i.test(x.v)) return "Een link moet met https:// beginnen.";
      if (
        typeof x.f !== "string" ||
        typeof x.v !== "string" ||
        x.f.length > 300 ||
        x.v.length > 300
      )
        return "Een contactgegeven is te lang.";
      if (/[<>]/.test(x.v)) return "Een contactgegeven bevat ongeldige tekens.";
    }
  }
  const text = (o.text ?? {}) as Record<string, unknown>,
    img = (o.img ?? {}) as Record<string, unknown>;
  if (typeof text !== "object" || typeof img !== "object") return "Geen geldige inhoud.";
  if (Object.keys(text).length > 3000 || Object.keys(img).length > 500)
    return "Te veel wijzigingen in één keer.";
  for (const [k, v] of Object.entries(text))
    if (typeof v !== "string" || k.length > 6000 || v.length > 6000) return "Een tekst is te lang.";
  const imgOk = new RegExp(
    "^https://[a-z0-9.-]+/storage/v1/object/public/" +
      BUCKET +
      "/" +
      site +
      "/img/[a-f0-9]{16}\\.(jpg|png|webp)$",
  );
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
        new Response(null, {
          status: 204,
          headers: cors(request, new URL(request.url).searchParams.get("site")),
        }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const a = url.searchParams.get("a"),
          site = url.searchParams.get("site") ?? "";
        if (a === "status") return json(cors(request, site), { store: true, site: !!SITES[site] });
        if (a !== "content") return json({}, { error: "Onbekende actie." }, 400);
        let content: unknown = null;
        if (SITES[site]) {
          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data } = await (supabaseAdmin as any)
              .from("beheer_content")
              .select("content")
              .eq("site", site)
              .maybeSingle();
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
            "cache-control": "public, max-age=0, s-maxage=15, stale-while-revalidate=30",
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
        if (!(await okCode(site, body.code)))
          return json(h, { error: "De toegangscode klopt niet." }, 401);
        if (a === "login") return json(h, { ok: true, store: true });
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const db = supabaseAdmin as any;
          if (a === "upload") {
            const m = /^data:(image\/(jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(
              String(body.dataUrl || ""),
            );
            if (!m) return json(h, { error: "Dit is geen geldige foto." }, 400);
            const bin = Uint8Array.from(atob(m[3]), (c) => c.charCodeAt(0));
            if (bin.length > 3.5 * 1024 * 1024)
              return json(h, { error: "Deze foto is te groot." }, 413);
            const ext = m[2] === "jpeg" ? "jpg" : m[2];
            const name =
              site +
              "/img/" +
              hex(await crypto.subtle.digest("SHA-1", bin)).slice(0, 16) +
              "." +
              ext;
            const up = await supabaseAdmin.storage
              .from(BUCKET)
              .upload(name, bin, { contentType: m[1], upsert: true, cacheControl: "31536000" });
            if (up.error) throw new Error(up.error.message);
            return json(h, {
              url: supabaseAdmin.storage.from(BUCKET).getPublicUrl(name).data.publicUrl,
            });
          }
          if (a === "publish") {
            const err = validContent(body.content, site);
            if (err) return json(h, { error: err }, 400);
            const c = body.content as Partial<Content>;
            const content: Content = {
              text: c.text ?? {},
              img: c.img ?? {},
              contact: c.contact ?? {},
              style: c.style ?? {},
            };
            const at = new Date().toISOString();
            const before = await liveBefore(db, site);
            const v = await db
              .from("beheer_versions")
              .insert({ site, content })
              .select("id")
              .single();
            if (v.error) throw new Error(v.error.message);
            const live = await db
              .from("beheer_content")
              .upsert({ site, content, published_at: at });
            if (live.error) throw new Error(live.error.message);
            // where/what/how per field, red flags, follow-up in the Hub (never blocks publishing)
            await logSiteChanges(db, {
              site,
              siteName: SITES[site].name,
              clientId: SITES[site].clientId,
              prev: before.content,
              next: content,
              versionId: v.data.id,
              prevVersionId: before.versionId,
              action: "publish",
              byWhom: "klant",
              where: whereHints(body.where),
            });
            return json(h, { ok: true, at });
          }
          if (a === "save") {
            const err = validContent(body.content, site);
            if (err) return json(h, { error: err }, 400);
            const c = body.content as Partial<Content>;
            const at = new Date().toISOString();
            const v = await db.from("beheer_versions").insert({
              site,
              content: { text: c.text ?? {}, img: c.img ?? {}, contact: c.contact ?? {}, style: c.style ?? {} },
              kind: "saved",
              created_at: at,
            });
            if (v.error) throw new Error(v.error.message);
            return json(h, { ok: true, at });
          }
          if (a === "load") {
            const { data: v } = await db
              .from("beheer_versions")
              .select("content")
              .eq("site", site)
              .eq("id", String(body.pathname || ""))
              .maybeSingle();
            if (!v) return json(h, { error: "Die versie bestaat niet meer." }, 404);
            return json(h, { content: v.content });
          }
          if (a === "history") {
            const { data: versions } = await db
              .from("beheer_versions")
              .select("id, created_at, kind")
              .eq("site", site)
              .order("created_at", { ascending: false })
              .limit(20);
            const { data: live } = await db
              .from("beheer_content")
              .select("content, published_at")
              .eq("site", site)
              .maybeSingle();
            return json(h, {
              versions: (versions ?? []).map(
                (x: { id: string; created_at: string; kind: string }) => ({
                  pathname: x.id,
                  at: x.created_at,
                  kind: x.kind,
                }),
              ),
              live: live?.content ?? null,
              liveAt: live?.published_at ?? null,
            });
          }
          if (a === "restore") {
            const id = String(body.pathname || "");
            const { data: v } = await db
              .from("beheer_versions")
              .select("content")
              .eq("site", site)
              .eq("id", id)
              .maybeSingle();
            if (!v) return json(h, { error: "Die versie bestaat niet meer." }, 404);
            const at = new Date().toISOString();
            const before = await liveBefore(db, site);
            const nv = await db
              .from("beheer_versions")
              .insert({ site, content: v.content, kind: "published" })
              .select("id")
              .single();
            const live = await db
              .from("beheer_content")
              .upsert({ site, content: v.content, published_at: at });
            if (live.error) throw new Error(live.error.message);
            await logSiteChanges(db, {
              site,
              siteName: SITES[site].name,
              clientId: SITES[site].clientId,
              prev: before.content,
              next: v.content,
              versionId: nv.data?.id ?? null,
              prevVersionId: before.versionId,
              action: "restore",
              byWhom: "klant",
            });
            return json(h, { ok: true, content: v.content });
          }
          return json(h, { error: "Onbekende actie." }, 400);
        } catch (e) {
          console.error("[beheer]", a, site, e instanceof Error ? e.message : e);
          return json(
            h,
            {
              error:
                a === "upload"
                  ? "Uploaden mislukt. Probeer het opnieuw."
                  : "Dat lukte niet. Probeer het zo meteen opnieuw.",
            },
            500,
          );
        }
      },
    },
  },
});
