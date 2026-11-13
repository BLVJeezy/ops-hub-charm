// Server-only: runs checks for monitored sites, stores results, manages incidents
// and sends alert emails through Resend. Uses the service-role client.
import {
  checkUrl,
  dbHealthHeaders,
  decideIncidents,
  deployResult,
  emailResult,
  EMAIL_PROBLEM_TYPES,
  incidentTitle,
  isDue,
  overallStatus,
  parseEndpoints,
  type CheckKind,
  type CheckResult,
  type IncidentAction,
  type OpenIncident,
  type Severity,
} from "./checks";

type Site = {
  id: string;
  name: string;
  url: string;
  db_provider: string;
  db_health_url: string | null;
  db_health_apikey: string | null;
  api_endpoints: unknown;
  email_domain: string | null;
  vercel_project_id: string | null;
  is_critical: boolean;
  check_interval_minutes: number;
  last_checked_at: string | null;
};

const HISTORY_DAYS = 30;
const CONCURRENCY = 4;

// The generated Database types do not include the new tables until Lovable
// regenerates them, so this module talks to them untyped.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function admin(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type Db = Awaited<ReturnType<typeof admin>>;

export type RunSummary = {
  checked: number;
  skipped: number;
  opened: number;
  resolved: number;
  errors: string[];
};

export async function runMonitoring(
  opts: { siteId?: string; force?: boolean } = {},
): Promise<RunSummary> {
  const db = await admin();
  const summary: RunSummary = { checked: 0, skipped: 0, opened: 0, resolved: 0, errors: [] };

  let q = db.from("monitored_sites").select("*").eq("enabled", true);
  if (opts.siteId) q = q.eq("id", opts.siteId);
  const { data: sites, error } = await q;
  if (error) throw new Error(error.message);

  const due = (sites as Site[]).filter(
    (s) => opts.force || isDue(s.last_checked_at, s.check_interval_minutes),
  );
  summary.skipped = (sites?.length ?? 0) - due.length;

  for (let i = 0; i < due.length; i += CONCURRENCY) {
    await Promise.all(
      due.slice(i, i + CONCURRENCY).map(async (site) => {
        try {
          const r = await checkSite(db, site);
          summary.checked++;
          summary.opened += r.opened;
          summary.resolved += r.resolved;
        } catch (e) {
          summary.errors.push(`${site.name}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }),
    );
  }

  // Keep history bounded.
  await db
    .from("health_checks")
    .delete()
    .lt("checked_at", new Date(Date.now() - HISTORY_DAYS * 86400_000).toISOString());
  await db
    .from("email_events")
    .delete()
    .lt("created_at", new Date(Date.now() - HISTORY_DAYS * 86400_000).toISOString());
  // Visitor hashes are only needed for today (and yesterday around midnight).
  await db
    .from("site_visitor_hashes")
    .delete()
    .lt("day", new Date(Date.now() - 2 * 86400_000).toISOString().slice(0, 10));

  return summary;
}

async function checkSite(db: Db, site: Site): Promise<{ opened: number; resolved: number }> {
  const results: CheckResult[] = [];
  const tasks: Promise<void>[] = [];
  const push = (p: Promise<CheckResult>) => tasks.push(p.then((r) => void results.push(r)));

  // 1. Website (HTTPS fetch also validates the TLS certificate)
  push(checkUrl("http", site.url));

  // 2. Important API endpoints
  for (const ep of parseEndpoints(site.api_endpoints)) {
    push(checkUrl("api", ep.url, { expectStatus: ep.expect_status }));
  }

  // 3. Database (read-only health URL)
  if (site.db_health_url) {
    push(checkUrl("db", site.db_health_url, { headers: dbHealthHeaders(site.db_health_apikey) }));
  }

  // 4. Latest production deployment (Vercel, optional token)
  let deploy: { state?: string; url?: string; created?: number } | null = null;
  if (site.vercel_project_id && process.env.VERCEL_TOKEN) {
    tasks.push(
      fetchLatestDeployment(site.vercel_project_id).then((d) => {
        deploy = d;
        if (d) results.push(deployResult(site.vercel_project_id!, d));
      }),
    );
  }

  // 5. Email delivery (Resend webhook events for this domain, last 24h)
  if (site.email_domain) {
    tasks.push(
      (async () => {
        const { count } = await db
          .from("email_events")
          .select("id", { count: "exact", head: true })
          .eq("from_domain", site.email_domain!.toLowerCase())
          .in("type", EMAIL_PROBLEM_TYPES as unknown as string[])
          .gte("created_at", new Date(Date.now() - 86400_000).toISOString());
        results.push(emailResult(site.email_domain!, count ?? 0));
      })(),
    );
  }

  await Promise.all(tasks);
  const now = new Date();

  // Store history
  await db
    .from("health_checks")
    .insert(results.map((r) => ({ ...r, site_id: site.id, checked_at: now.toISOString() })));

  // Update summary on the site row
  const http = results.find((r) => r.kind === "http")!;
  const kindState = (k: CheckKind, okWord = "ok", failWord = "fail") => {
    const rs = results.filter((r) => r.kind === k);
    if (!rs.length) return "not_configured";
    return rs.every((r) => r.ok) ? okWord : failWord;
  };
  const d = deploy as { state?: string; url?: string; created?: number } | null;
  await db
    .from("monitored_sites")
    .update({
      last_status: overallStatus(results),
      last_checked_at: now.toISOString(),
      last_http_status: http.status_code,
      last_response_ms: http.response_ms,
      last_error:
        results
          .filter((r) => !r.ok)
          .map((r) => `[${r.kind}] ${r.error}`)
          .join(" · ") || null,
      ssl_ok: site.url.startsWith("https://") ? http.status_code !== null : null,
      db_status: kindState("db"),
      api_status: kindState("api"),
      email_status: kindState("email", "ok", "issues"),
      ...(d
        ? {
            last_deploy_state: d.state ?? null,
            last_deploy_at: d.created ? new Date(d.created).toISOString() : null,
            last_deploy_url: d.url ? `https://${d.url}` : null,
          }
        : {}),
    })
    .eq("id", site.id);

  // Incidents
  const { data: openRows } = await db
    .from("incidents")
    .select("id, kind, severity, last_notified_at")
    .eq("site_id", site.id)
    .eq("status", "open");
  const actions = decideIncidents(
    results,
    (openRows ?? []) as OpenIncident[],
    site.is_critical,
    now,
  );
  let opened = 0,
    resolved = 0;
  for (const a of actions) {
    await applyAction(db, site, a, now);
    if (a.type === "open") opened++;
    if (a.type === "resolve") resolved++;
  }
  return { opened, resolved };
}

async function applyAction(db: Db, site: Site, a: IncidentAction, now: Date) {
  const title = incidentTitle(a.kind, site.name);
  if (a.type === "open") {
    const sent = await sendAlert(a.severity, title, a.detail, site);
    await db.from("incidents").insert({
      site_id: site.id,
      kind: a.kind,
      severity: a.severity,
      title,
      detail: a.detail,
      last_notified_at: sent ? now.toISOString() : null,
      notify_count: sent ? 1 : 0,
    });
  } else if (a.type === "renotify") {
    const sent = await sendAlert(a.severity, `Still failing: ${title}`, a.detail, site);
    if (sent) {
      const { data } = await db
        .from("incidents")
        .select("notify_count")
        .eq("id", a.id)
        .maybeSingle();
      await db
        .from("incidents")
        .update({
          last_notified_at: now.toISOString(),
          notify_count: (data?.notify_count ?? 0) + 1,
          detail: a.detail,
        })
        .eq("id", a.id);
    }
  } else {
    await db
      .from("incidents")
      .update({ status: "resolved", resolved_at: now.toISOString() })
      .eq("id", a.id);
    await sendAlert(
      "info",
      `Resolved: ${title}`,
      "All checks for this item are passing again.",
      site,
    );
  }
}

async function fetchLatestDeployment(
  projectId: string,
): Promise<{ state?: string; url?: string; created?: number } | null> {
  const params = new URLSearchParams({ projectId, target: "production", limit: "1" });
  params.set("teamId", process.env.VERCEL_TEAM_ID || "team_LMDAIL57CfPMVXgRrEHeVIzi");
  try {
    const res = await fetch(`https://api.vercel.com/v6/deployments?${params}`, {
      headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}` },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      deployments?: Array<{ state?: string; readyState?: string; url?: string; created?: number }>;
    };
    const dep = body.deployments?.[0];
    return dep ? { state: dep.state ?? dep.readyState, url: dep.url, created: dep.created } : null;
  } catch {
    return null;
  }
}

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "CRITICAL",
  warning: "Warning",
  info: "Info",
};
const SEVERITY_COLOR: Record<Severity, string> = {
  critical: "#DC2626",
  warning: "#D97706",
  info: "#1D9E75",
};

function esc(s: string) {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );
}

/** Returns true when Resend accepted the email. Never throws. */
async function sendAlert(
  severity: Severity,
  title: string,
  detail: string,
  site: Site,
): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const to = process.env.ALERT_EMAIL_TO || "jason@solynglobal.be";
  const from = process.env.ALERT_EMAIL_FROM || "Solyn Status <status@solynglobal.be>";
  const hubUrl = process.env.HUB_PUBLIC_URL
    ? `${process.env.HUB_PUBLIC_URL.replace(/\/$/, "")}/status`
    : null;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#1B222C">
      <div style="display:inline-block;padding:4px 10px;border-radius:999px;background:${SEVERITY_COLOR[severity]};color:#fff;font-size:12px;font-weight:bold">${SEVERITY_LABEL[severity]}</div>
      <h2 style="margin:12px 0 4px">${esc(title)}</h2>
      <p style="margin:0 0 12px;color:#6b6b6b">${esc(site.url)}</p>
      <pre style="white-space:pre-wrap;background:#f5f5f3;padding:12px;border-radius:8px;font-size:13px">${esc(detail)}</pre>
      ${hubUrl ? `<p><a href="${hubUrl}" style="color:#C9A24B">Open Status in Hub OS</a></p>` : ""}
    </div>`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `[${SEVERITY_LABEL[severity]}] ${title}`,
        html,
        text: `${title}\n${site.url}\n\n${detail}`,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
