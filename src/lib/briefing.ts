/** Daily noon briefing: pure helpers (status of a snapshot, mail body). Mirrors briefing-film/plan.js. */

export type SnapSite = {
  id: string;
  name: string;
  url?: string;
  last_status?: string | null;
  last_error?: string | null;
  last_response_ms?: number | null;
  uptime24?: number | null;
  checks24?: number | null;
  incidents?: Array<{ severity: string; title: string; status: string; opened_at?: string }>;
  visitors_yesterday?: number | null;
  visitors_day_before?: number | null;
  visitors_7d?: number | null;
  new_24h?: number | null;
  upcoming_7d?: number | null;
};
export type Snapshot = {
  day: string;
  generated_at?: string;
  sites: SnapSite[];
  invoices?: { open_count?: number; open_total?: number; overdue_count?: number; draft_count?: number; paid_30d?: number };
  backups?: { target: string; ok: boolean; at: string; stale?: boolean; error?: string | null }[];
};
export type SiteState = "ok" | "warn" | "down";
export type BriefingStatus = "ok" | "warning" | "critical";

export function siteState(s: SnapSite): SiteState {
  const open = (s.incidents ?? []).filter((i) => i.status === "open");
  if (s.last_status === "down" || open.some((i) => i.severity === "critical")) return "down";
  if (s.last_status === "degraded" || open.length || (s.uptime24 != null && Number(s.uptime24) < 99)) return "warn";
  return "ok";
}

/** Backups that failed last night or have not run for 36 hours. */
export function backupIssues(snap: Snapshot): string[] {
  return (snap.backups ?? []).filter((b) => !b.ok || b.stale).map((b) => b.target);
}

export function briefingStatus(snap: Snapshot): BriefingStatus {
  const st = (snap.sites ?? []).map(siteState);
  if (st.includes("down")) return "critical";
  return st.includes("warn") || backupIssues(snap).length ? "warning" : "ok";
}

export function totals(snap: Snapshot) {
  const sum = (k: keyof SnapSite) => (snap.sites ?? []).reduce((a, s) => a + (Number(s[k]) || 0), 0);
  return {
    visitors: sum("visitors_yesterday"),
    week: sum("visitors_7d"),
    fresh: sum("new_24h"),
    upcoming: sum("upcoming_7d"),
    overdue: snap.invoices?.overdue_count ?? 0,
    open: snap.invoices?.open_count ?? 0,
  };
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const LABEL: Record<BriefingStatus, { word: string; color: string }> = {
  ok: { word: "Alles in orde", color: "#16a34a" },
  warning: { word: "Aandacht nodig", color: "#d97706" },
  critical: { word: "Kritiek", color: "#dc2626" },
};

export function briefingMail(snap: Snapshot, link: string | null, hasVideo: boolean) {
  const status = briefingStatus(snap);
  const T = totals(snap);
  const L = LABEL[status];
  const rows = [...(snap.sites ?? [])]
    .sort((a, b) => ["down", "warn", "ok"].indexOf(siteState(a)) - ["down", "warn", "ok"].indexOf(siteState(b)))
    .map((s) => {
      const st = siteState(s);
      const dot = st === "down" ? "#dc2626" : st === "warn" ? "#d97706" : "#16a34a";
      return `<tr><td style="padding:6px 8px"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${dot}"></span> ${esc(s.name)}</td>
        <td style="padding:6px 8px;text-align:right">${s.uptime24 != null ? Number(s.uptime24).toFixed(1) + "%" : "—"}</td>
        <td style="padding:6px 8px;text-align:right">${s.visitors_yesterday ?? 0}</td>
        <td style="padding:6px 8px;text-align:right">${s.new_24h ?? 0}</td></tr>`;
    })
    .join("");
  const bad = backupIssues(snap);
  const backupLine = snap.backups?.length
    ? bad.length
      ? `<p style="margin:12px 0 0;color:#d97706">Back-up niet gelukt: ${bad.map(esc).join(", ")}</p>`
      : `<p style="margin:12px 0 0;color:#6b6b6b;font-size:12px">Off-site back-ups vannacht: alle ${snap.backups.length} gelukt</p>`
    : "";
  const subject = `[${L.word}] Noon scan ${snap.day} · ${T.visitors} bezoekers gisteren`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1B222C">
    <div style="display:inline-block;padding:4px 10px;border-radius:999px;background:${L.color};color:#fff;font-size:12px;font-weight:bold">${L.word}</div>
    <h2 style="margin:12px 0 4px">Noon scan · ${esc(snap.day)}</h2>
    <p style="margin:0 0 12px;color:#6b6b6b">${T.visitors} bezoekers gisteren · ${T.week} deze week · ${T.fresh} nieuwe aanvragen · ${T.overdue} facturen te laat</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tr style="color:#6b6b6b;font-size:12px"><td style="padding:6px 8px">Site</td><td style="padding:6px 8px;text-align:right">Uptime 24u</td><td style="padding:6px 8px;text-align:right">Bezoekers</td><td style="padding:6px 8px;text-align:right">Nieuw</td></tr>
      ${rows}
    </table>
    ${backupLine}
    ${link ? `<p style="margin-top:16px"><a href="${esc(link)}" style="background:#C9A24B;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">${hasVideo ? "Bekijk de video in Hub OS" : "Open de briefing in Hub OS"}</a></p>` : ""}
    ${hasVideo ? "" : `<p style="color:#6b6b6b;font-size:12px">De video wordt nog gemaakt en verschijnt zo in de Hub.</p>`}
  </div>`;
  const text = `Noon scan ${snap.day}: ${L.word}. ${T.visitors} bezoekers gisteren, ${T.fresh} nieuwe aanvragen.${link ? "\n" + link : ""}`;
  return { status, subject, html, text };
}

/** Brussels wall-clock hour for a date (handles DST). */
export function brusselsHour(d = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Brussels", hour: "2-digit", hour12: false }).format(d)) % 24;
}
