import { createFileRoute } from "@tanstack/react-router";
import { SITES, okCode, siteCors } from "@/lib/beheer-sites";

/**
 * Supportchat in de beheerpagina van elke klantwebsite. Alles POST met JSON {site, code, ...}.
 *
 *   ?a=threads                          -> { threads: [{id, title, status, updated_at, last_author, unread}] }
 *   ?a=messages {thread}                -> { thread, messages }   (zet "gelezen door klant")
 *   ?a=send {thread?, body, images[]}   -> { thread, message }    (zonder thread: nieuw gesprek; images = data-URLs, max 3)
 *
 * Een nieuw bericht van de klant komt in de Hub (/support) en per mail bij mij, maar niet vaker dan om de 10 minuten per gesprek.
 */
const json = (h: Record<string, string>, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...h },
  });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const Route = createFileRoute("/api/public/support")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, { status: 204, headers: siteCors(request, new URL(request.url).searchParams.get("site")) }),
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const a = url.searchParams.get("a");
        let body: Record<string, unknown> = {};
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          /* empty */
        }
        const site = String(body.site ?? url.searchParams.get("site") ?? "");
        const h = siteCors(request, site);
        if (!SITES[site]) return json(h, { error: "Onbekende website." }, 404);
        if (!(await okCode(site, body.code))) return json(h, { error: "De toegangscode klopt niet." }, 401);
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const db = supabaseAdmin as any;

          if (a === "threads") {
            const { data, error } = await db
              .from("support_threads")
              .select("id, title, status, updated_at, last_author, client_seen_at")
              .eq("site", site)
              .order("updated_at", { ascending: false })
              .limit(50);
            if (error) throw new Error(error.message);
            type T = { id: string; title: string; status: string; updated_at: string; last_author: string; client_seen_at: string | null };
            const threads = ((data ?? []) as T[]).map((t) => ({
              id: t.id,
              title: t.title,
              status: t.status,
              updated_at: t.updated_at,
              last_author: t.last_author,
              unread: t.last_author === "solyn" && (!t.client_seen_at || t.client_seen_at < t.updated_at),
            }));
            return json(h, { threads });
          }

          if (a === "messages") {
            const id = String(body.thread ?? "");
            if (!UUID.test(id)) return json(h, { error: "Onbekend gesprek." }, 400);
            const { data: t } = await db
              .from("support_threads")
              .select("id, title, status, created_at, updated_at")
              .eq("id", id)
              .eq("site", site)
              .maybeSingle();
            if (!t) return json(h, { error: "Dit gesprek bestaat niet (meer)." }, 404);
            const { data: msgs } = await db
              .from("support_messages")
              .select("id, author, body, attachments, created_at")
              .eq("thread_id", id)
              .order("created_at", { ascending: true })
              .limit(300);
            await db.from("support_threads").update({ client_seen_at: new Date().toISOString() }).eq("id", id);
            return json(h, { thread: t, messages: msgs ?? [] });
          }

          if (a === "send") {
            const text = String(body.body ?? "").trim().slice(0, 4000);
            const raw = Array.isArray(body.images) ? (body.images as unknown[]).slice(0, 3) : [];
            if (!text && !raw.length) return json(h, { error: "Schrijf eerst een bericht." }, 400);

            const since = new Date(Date.now() - 3600_000).toISOString();
            const { data: mine } = await db.from("support_threads").select("id").eq("site", site);
            const ids = ((mine ?? []) as { id: string }[]).map((x) => x.id);
            if (ids.length) {
              const { count } = await db
                .from("support_messages")
                .select("id", { count: "exact", head: true })
                .in("thread_id", ids)
                .eq("author", "client")
                .gte("created_at", since);
              if ((count ?? 0) >= 40) return json(h, { error: "Veel berichten op korte tijd. Probeer het straks opnieuw." }, 429);
            }

            const { storeChatImage, createThread, mailOwnerAboutMessage } = await import("@/lib/support.server");
            const attachments = [];
            for (const [i, d] of raw.entries()) {
              const m = typeof d === "string" ? /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(d) : null;
              if (!m) continue;
              const bin = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
              const att = await storeChatImage(supabaseAdmin, site, bin, m[1], `foto-${i + 1}`);
              if (att) attachments.push(att);
            }
            if (!text && !attachments.length) return json(h, { error: "De foto kon niet verstuurd worden." }, 400);

            let id = String(body.thread ?? "");
            let title = "";
            let mailIt = true;
            if (id) {
              if (!UUID.test(id)) return json(h, { error: "Onbekend gesprek." }, 400);
              const { data: t } = await db
                .from("support_threads")
                .select("id, title, last_author, updated_at")
                .eq("id", id)
                .eq("site", site)
                .maybeSingle();
              if (!t) return json(h, { error: "Dit gesprek bestaat niet (meer)." }, 404);
              title = t.title;
              mailIt = t.last_author !== "client" || Date.now() - Date.parse(t.updated_at) > 10 * 60_000;
              const ins = await db
                .from("support_messages")
                .insert({ thread_id: id, author: "client", body: text, attachments })
                .select("id, author, body, attachments, created_at")
                .single();
              if (ins.error) throw new Error(ins.error.message);
              const now = new Date().toISOString();
              await db
                .from("support_threads")
                .update({ updated_at: now, last_author: "client", client_seen_at: now, status: "open" })
                .eq("id", id);
              if (mailIt) await mailOwnerAboutMessage(site, id, title, text, attachments.length);
              return json(h, { thread: id, message: ins.data });
            }
            const first = text.split(/\n/)[0].replace(/\s+/g, " ").trim();
            title = String(body.title ?? "").trim().slice(0, 140) || (first.length > 80 ? first.slice(0, 79) + "…" : first) || "Foto van " + SITES[site].name;
            const made = await createThread(db, { site, title, body: text, attachments });
            if (!made) throw new Error("thread");
            await mailOwnerAboutMessage(site, made, title, text, attachments.length);
            return json(h, { thread: made });
          }
          return json(h, { error: "Onbekende actie." }, 400);
        } catch (e) {
          console.error("[support] failed", e instanceof Error ? e.message : e);
          return json(h, { error: "Dat lukte niet. Probeer het opnieuw." }, 500);
        }
      },
    },
  },
});
