import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Undo one publish from a client: the site goes back to the version that was live before it.
 * The undo itself is logged (by Solyn, already checked) and the undone batch is marked as checked.
 */
export const undoSiteChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { batchId: string }) => {
    if (!i?.batchId || !/^[0-9a-f-]{36}$/.test(i.batchId)) throw new Error("Onbekende wijziging");
    return { batchId: i.batchId };
  })
  .handler(async ({ data, context }) => {
    const { data: staff, error: roleError } = await context.supabase.rpc("is_staff", {
      _user_id: context.userId,
    });
    if (roleError) throw new Error(roleError.message);
    if (!staff) throw new Error("Alleen voor het team");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { SITES } = await import("./beheer-sites");
    const { logSiteChanges } = await import("./site-changes.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;
    const { data: b } = await db
      .from("site_change_batches")
      .select("id, site, client_id, version_id, prev_version_id")
      .eq("id", data.batchId)
      .single();
    if (!b) throw new Error("Wijziging niet gevonden");
    // what was live before this publish: the previous version, or nothing at all (the original site)
    let back = { text: {}, img: {}, contact: {} } as Record<string, unknown>;
    if (b.prev_version_id) {
      const { data: v } = await db
        .from("beheer_versions")
        .select("content")
        .eq("id", b.prev_version_id)
        .maybeSingle();
      if (!v) throw new Error("De vorige versie bestaat niet meer");
      back = v.content;
    }
    const { data: live } = await db
      .from("beheer_content")
      .select("content")
      .eq("site", b.site)
      .maybeSingle();
    const at = new Date().toISOString();
    const { data: nv, error: vErr } = await db
      .from("beheer_versions")
      .insert({ site: b.site, content: back, kind: "published" })
      .select("id")
      .single();
    if (vErr) throw new Error(vErr.message);
    const up = await db
      .from("beheer_content")
      .upsert({ site: b.site, content: back, published_at: at });
    if (up.error) throw new Error(up.error.message);
    const { data: lastV } = await db
      .from("beheer_versions")
      .select("id")
      .eq("site", b.site)
      .eq("kind", "published")
      .neq("id", nv.id)
      .order("created_at", { ascending: false })
      .limit(1);
    await logSiteChanges(db, {
      site: b.site,
      siteName: SITES[b.site]?.name ?? b.site,
      clientId: b.client_id,
      prev: live?.content ?? null,
      next: back,
      versionId: nv.id,
      prevVersionId: lastV?.[0]?.id ?? null,
      action: "undo",
      byWhom: "solyn",
    });
    await db.from("site_change_batches").update({ reviewed_at: at }).eq("id", b.id);
    return { ok: true };
  });
