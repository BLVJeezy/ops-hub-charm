import type { SupabaseClient } from "@supabase/supabase-js";
import { ownerAlerts } from "@/lib/alerts";
import { brusselsToday } from "@/lib/invoice-schedule";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/**
 * The daily word to the owner: one e-mail with what needs him (invoices open 14 days or more, clients behind on their videos).
 * Sent only on the days an item is due for it, so it never becomes noise. Sites going offline are mailed by the monitor itself.
 * Never throws: an alert that fails must not break the job it rides on.
 */
export async function mailOwnerAlerts(supabase: SupabaseClient): Promise<{ alerts: number; mailed: boolean; error?: string }> {
  try {
    const today = brusselsToday();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const [inv, cli, vid, sit] = await Promise.all([
      db.from("invoices").select("id,client,client_name,total,status,sent_at,invoice_number").eq("status", "Sent"),
      db.from("clients").select("id,name,status,is_internal,social_videos_per_month,social_start_date,social_end_date"),
      db.from("client_videos").select("client_id,month,sent_at").gte("month", today.slice(0, 7) + "-01"),
      db.from("monitored_sites").select("id,name,client_id,last_status").eq("enabled", true),
    ]);
    const all = ownerAlerts({ invoices: inv.data ?? [], clients: cli.data ?? [], videos: vid.data ?? [], sites: sit.data ?? [], today });
    const due = all.filter((a) => a.mail);
    if (!due.length) return { alerts: all.length, mailed: false };
    const key = process.env.RESEND_API_KEY;
    if (!key) return { alerts: all.length, mailed: false, error: "RESEND_API_KEY not configured" };
    const to = process.env.ALERT_EMAIL_TO || "jason@solynglobal.be";
    const from = process.env.ALERT_EMAIL_FROM || "Solyn Status <status@solynglobal.be>";
    const hub = process.env.HUB_PUBLIC_URL ? `${process.env.HUB_PUBLIC_URL.replace(/\/$/, "")}/brain` : null;
    const list = all.filter((a) => a.kind !== "site");   // everything open, the due ones first
    list.sort((a, b) => Number(b.mail) - Number(a.mail));
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#1B222C">
        <h2 style="margin:0 0 12px">${list.length} ${list.length === 1 ? "punt vraagt" : "punten vragen"} je aandacht</h2>
        ${list.map((a) => `<div style="padding:10px 12px;margin:0 0 8px;border-radius:8px;background:#f5f5f3"><strong>${esc(a.title)}</strong><br><span style="color:#6b6b6b;font-size:13px">${esc(a.detail)}</span></div>`).join("")}
        ${hub ? `<p><a href="${hub}" style="color:#C9A24B">Open de Brain in Hub OS</a></p>` : ""}
      </div>`;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ from, to: [to], subject: `Solyn: ${due[0].title}${list.length > 1 ? ` (+${list.length - 1})` : ""}`, html, text: list.map((a) => `${a.title}\n${a.detail}`).join("\n\n") }),
    });
    return { alerts: all.length, mailed: res.ok, error: res.ok ? undefined : `resend ${res.status}` };
  } catch (e) {
    return { alerts: 0, mailed: false, error: e instanceof Error ? e.message : "failed" };
  }
}
