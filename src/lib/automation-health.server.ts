import { evaluate, type Evidence, type Health } from "./automation-health";
import { LIVE } from "./automations";

/**
 * Gathers the evidence, judges every live automation, stores the verdicts and mails me when one goes wrong.
 * Mails once when an automation turns stale, and again at most once a day while it stays stale.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function runAutomationHealth(db: any, opts: { mail?: boolean } = {}) {
  const now = Date.now(),
    iso = new Date(now).toISOString();
  const hub = (process.env.HUB_PUBLIC_URL || "https://solyn22.lovable.app").replace(/\/$/, "");
  const ping = async (url: string, ok: (r: Response) => boolean) => {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      return ok(r);
    } catch {
      return false;
    }
  };
  const [cron, sites, brief, bookingEndpoint, requestEndpoint] = await Promise.all([
    db.rpc("cron_status"),
    db
      .from("monitored_sites")
      .select("last_checked_at, last_backup_at, analytics_synced_at")
      .eq("enabled", true),
    db
      .from("daily_briefings")
      .select("rendered_at, created_at")
      .order("day", { ascending: false })
      .limit(1),
    ping(`${hub}/api/public/booking`, (r) => r.ok),
    // a made-up token must be refused with a 404: proves the route is up without touching real data
    ping(`${hub}/api/public/request?token=${"0".repeat(36)}`, (r) => r.status === 404),
  ]);
  if (cron.error) throw new Error(`cron_status: ${cron.error.message}`);
  const latest = (k: string) =>
    ((sites.data ?? []) as Record<string, string | null>[])
      .map((s) => s[k])
      .filter(Boolean)
      .sort()
      .pop() ?? null;
  const evidence: Evidence = {
    cron: Object.fromEntries(
      (
        (cron.data ?? []) as {
          jobname: string;
          last_run: string | null;
          last_status: string | null;
        }[]
      ).map((r) => [r.jobname, { last_run: r.last_run, last_status: r.last_status }]),
    ),
    lastChecked: latest("last_checked_at"),
    lastBackup: latest("last_backup_at"),
    analytics: latest("analytics_synced_at"),
    briefing: brief.data?.[0]?.rendered_at ?? brief.data?.[0]?.created_at ?? null,
    bookingEndpoint,
    requestEndpoint,
  };
  const verdicts = evaluate(
    LIVE.map((a) => a.id),
    evidence,
    now,
  );

  const { data: before } = await db
    .from("automation_health")
    .select("automation_id, status, since, alerted_at");
  const prev = new Map(
    (
      (before ?? []) as {
        automation_id: string;
        status: string;
        since: string;
        alerted_at: string | null;
      }[]
    ).map((r) => [r.automation_id, r]),
  );
  const rows = Object.entries(verdicts).map(([id, v]) => {
    const p = prev.get(id);
    return {
      automation_id: id,
      status: v.status,
      detail: v.detail,
      checked_at: iso,
      since: p && p.status === v.status ? p.since : iso,
      alerted_at: v.status === "stale" ? (p?.alerted_at ?? null) : null,
    };
  });

  // who needs a mail: newly stale, or stale and last told more than a day ago
  const tell = rows.filter(
    (r) => r.status === "stale" && (!r.alerted_at || now - Date.parse(r.alerted_at) > 24 * 36e5),
  );
  let mailed = false;
  if (tell.length && opts.mail !== false && process.env.RESEND_API_KEY) {
    const name = (id: string) => LIVE.find((a) => a.id === id)?.name ?? id;
    const esc = (s: string) =>
      s.replace(
        /[&<>"']/g,
        (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
      );
    const list = tell
      .map(
        (r) =>
          `<li style="margin:0 0 8px"><strong>${esc(name(r.automation_id))}</strong><br><span style="color:#555">${esc(r.detail ?? "")}</span></li>`,
      )
      .join("");
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: process.env.BOOKING_EMAIL_FROM || "Solyn Global <status@solynglobal.be>",
        to: [process.env.ALERT_EMAIL_TO || "jason@solynglobal.be"],
        subject: `${tell.length === 1 ? "Een automation draait niet" : `${tell.length} automations draaien niet`}: ${tell.map((r) => name(r.automation_id)).join(", ")}`,
        html: `<div style="font-family:system-ui,sans-serif;max-width:560px;color:#111"><h2 style="margin:0 0 12px">Automations nakijken</h2><p>De controle van ${new Date(now).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels" })} vond dit:</p><ul style="padding-left:18px">${list}</ul><p><a href="${hub}/automations" style="display:inline-block;background:#111;color:#fff;padding:10px 16px;border-radius:999px;text-decoration:none">Open Automations</a></p></div>`,
        text: `Automations nakijken:\n\n${tell.map((r) => `- ${name(r.automation_id)}: ${r.detail}`).join("\n")}\n\n${hub}/automations`,
      }),
    });
    mailed = res.ok;
    if (mailed) for (const r of tell) r.alerted_at = iso;
  }
  const up = await db.from("automation_health").upsert(rows, { onConflict: "automation_id" });
  if (up.error) throw new Error(up.error.message);
  return {
    checked: rows.length,
    stale: rows.filter((r) => r.status === "stale").map((r) => r.automation_id),
    mailed,
    verdicts: verdicts as Record<string, Health>,
  };
}
