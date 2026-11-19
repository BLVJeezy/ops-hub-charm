/** The "Eerdere problemen" bar on Status: what went wrong on a site, what happened, and whether it is solved. */

export type IncidentLike = {
  id: string;
  site_id: string;
  kind: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string | null;
  status: "open" | "resolved";
  opened_at: string;
  resolved_at: string | null;
  resolution_note?: string | null;
};
export type BackupLike = {
  target: string;
  ok: boolean;
  at: string;
  error: string | null;
  stale: boolean;
};

export type Problem = {
  id: string;
  site: string;
  title: string;
  /** what happened, in plain words */
  what: string;
  solved: boolean;
  severity: "critical" | "warning" | "info";
  since: string;
  solvedAt: string | null;
  /** how long it lasted, or has lasted so far */
  lasted: string;
  source: "monitor" | "backup";
};

const KIND: Record<string, string> = {
  down: "De site was niet bereikbaar",
  http: "De site gaf een foutcode",
  slow: "De site was traag",
  ssl: "Probleem met het beveiligde certificaat (HTTPS)",
  db: "De database antwoordde niet",
  api: "Een koppeling (API) werkte niet",
  email: "Probleem met de e-mailinstellingen",
  deploy: "Een nieuwe versie zetten mislukte",
  backup: "De back-up lukte niet",
};

export function lasted(from: string, to: string | null, now = Date.now()): string {
  const s = Math.max(
    0,
    Math.round(((to ? new Date(to).getTime() : now) - new Date(from).getTime()) / 1000),
  );
  if (s < 90) return "minder dan 2 min";
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 86400) return `${Math.round(s / 3600)} u`;
  return `${Math.round(s / 86400)} d`;
}

/** Turn a raw backup error into something readable. */
export function backupWhat(error: string): string {
  if (/REPO_TOKEN/i.test(error))
    return "De code van deze site staat in een privé-repo. Zonder sleutel (REPO_TOKEN) kan de back-up de code niet ophalen; de gegevens zelf zijn wel bewaard.";
  if (/firebase/i.test(error))
    return "De database van deze site staat in Firebase en de back-up heeft daar nog geen toegang toe. De code is wel bewaard.";
  return error;
}

/**
 * Open problems first, then solved ones from the last `days` days, newest first.
 * Backup notes count as open problems as long as the latest backup still reports them.
 */
export function problems(
  incidents: IncidentLike[],
  backups: BackupLike[],
  siteName: (id: string) => string,
  backupName: (target: string) => string,
  days = 30,
  now = Date.now(),
): Problem[] {
  const since = now - days * 86400_000;
  const fromIncidents: Problem[] = incidents
    .filter((i) => i.status === "open" || new Date(i.resolved_at ?? i.opened_at).getTime() >= since)
    .map((i) => ({
      id: i.id,
      site: siteName(i.site_id),
      title: i.title,
      what: [
        KIND[i.kind] ?? null,
        i.detail,
        i.resolution_note ? `Oplossing: ${i.resolution_note}` : null,
      ]
        .filter(Boolean)
        .join(". "),
      solved: i.status === "resolved",
      severity: i.severity,
      since: i.opened_at,
      solvedAt: i.resolved_at,
      lasted: lasted(i.opened_at, i.resolved_at, now),
      source: "monitor",
    }));
  const fromBackups: Problem[] = backups
    .filter((b) => b.error || !b.ok)
    .map((b) => ({
      id: `backup:${b.target}`,
      site: backupName(b.target),
      title: !b.ok ? "Back-up mislukt" : "Back-up onvolledig",
      what: backupWhat(b.error ?? "De laatste back-up is mislukt."),
      solved: false,
      severity: !b.ok ? "critical" : "warning",
      since: b.at,
      solvedAt: null,
      lasted: "",
      source: "backup",
    }));
  return [...fromIncidents, ...fromBackups].sort(
    (a, b) =>
      Number(a.solved) - Number(b.solved) ||
      new Date(b.since).getTime() - new Date(a.since).getTime(),
  );
}
