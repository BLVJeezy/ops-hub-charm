import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/** Check a client's live website and domain, and store what was found on the checklist (ticks you set stay as they are). */
export const scanChecklist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ client_id: z.string().uuid(), url: z.string().url().optional() }))
  .handler(async ({ data, context }) => {
    const { data: staff } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
    if (!staff) throw new Error("Alleen voor beheerders.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;
    const [{ data: client }, { data: sites }] = await Promise.all([
      db.from("clients").select("id, drive_url").eq("id", data.client_id).maybeSingle(),
      db.from("monitored_sites").select("url, enabled, analytics_provider, tracking_id").eq("client_id", data.client_id),
    ]);
    if (!client) throw new Error("Klant niet gevonden.");
    const site = (sites ?? []).find((s: { enabled: boolean }) => s.enabled) ?? (sites ?? [])[0];
    const url = data.url || site?.url;
    if (!url) throw new Error("Deze klant heeft nog geen website-adres. Vul het in of voeg de site toe bij Status.");
    const { scanSite, FOUND_TO_KEY } = await import("./site-checklist.server");
    const found = await scanSite(url, { analytics: !!(site?.analytics_provider || site?.tracking_id), drive: !!client.drive_url, status: !!site?.enabled });
    const now = new Date().toISOString();
    const rows = Object.entries(found).map(([k, v]) => ({ client_id: data.client_id, key: FOUND_TO_KEY[k], auto_state: v!.ok ? "ok" : "mis", auto_detail: v!.detail.slice(0, 200), auto_at: now }));
    const r = await db.from("client_checklist").upsert(rows, { onConflict: "client_id,key" });
    if (r.error) throw new Error(r.error.message);
    return { url, ok: rows.filter((x) => x.auto_state === "ok").length, checked: rows.length };
  });
