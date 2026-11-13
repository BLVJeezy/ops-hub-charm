import { normaliseRecords } from "./site-records";

/**
 * Pulls appointments/reservations/orders from client sites that expose a read-only
 * export (table site_bridges, server-only) into site_records. Client sites are never
 * written to.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function admin(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type Bridge = { site_id: string; kind: string; url: string; apikey: string | null; token: string };

async function fetchBridge(b: Bridge): Promise<unknown> {
  let res: Response;
  if (b.kind === "supabase_rpc") {
    res = await fetch(`${b.url.replace(/\/$/, "")}/rest/v1/rpc/hub_export_records`, {
      method: "POST",
      headers: {
        apikey: b.apikey ?? "",
        Authorization: `Bearer ${b.apikey ?? ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ _token: b.token }),
    });
  } else {
    res = await fetch(b.url, { headers: { Authorization: `Bearer ${b.token}` } });
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export type RecordsSyncResult = { site_id: string; ok: boolean; records?: number; removed?: number; error?: string };

export async function syncSiteRecords(siteId?: string): Promise<RecordsSyncResult[]> {
  const db = await admin();
  let q = db.from("site_bridges").select("site_id,kind,url,apikey,token");
  if (siteId) q = q.eq("site_id", siteId);
  const { data: bridges, error } = await q;
  if (error) throw new Error(error.message);

  const results: RecordsSyncResult[] = [];
  for (const b of (bridges ?? []) as Bridge[]) {
    try {
      const records = normaliseRecords(await fetchBridge(b));
      const now = new Date().toISOString();
      const rows = records.map((r) => ({ ...r, site_id: b.site_id, synced_at: now }));
      for (let i = 0; i < rows.length; i += 500) {
        const { error: e } = await db
          .from("site_records")
          .upsert(rows.slice(i, i + 500), { onConflict: "site_id,kind,external_id" });
        if (e) throw new Error(e.message);
      }
      // Rows not seen in this export were deleted on the client site.
      const { data: gone, error: e2 } = await db
        .from("site_records")
        .delete()
        .eq("site_id", b.site_id)
        .lt("synced_at", now)
        .select("id");
      if (e2) throw new Error(e2.message);
      await db.from("site_bridges").update({ last_sync_at: now, last_error: null }).eq("site_id", b.site_id);
      results.push({ site_id: b.site_id, ok: true, records: rows.length, removed: gone?.length ?? 0 });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await db.from("site_bridges").update({ last_error: msg.slice(0, 300) }).eq("site_id", b.site_id);
      results.push({ site_id: b.site_id, ok: false, error: msg });
    }
  }
  return results;
}
