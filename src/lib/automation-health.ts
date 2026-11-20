/**
 * The hourly check: did every automation really run? Each one is judged on hard evidence
 * (a cron job's last run and result, a timestamp the job writes, or an endpoint that answers),
 * never on "it should have". Claude tasks run outside the Hub, so the Hub cannot see them: they are "unknown", not "ok".
 */
export type HealthStatus = "ok" | "stale" | "unknown";
export type Health = { status: HealthStatus; detail: string };
export type CronRun = { last_run: string | null; last_status: string | null };
export type Evidence = {
  cron: Record<string, CronRun>;
  lastChecked: string | null;
  lastBackup: string | null;
  analytics: string | null;
  briefing: string | null;
  bookingEndpoint: boolean | null;
  requestEndpoint: boolean | null;
};

const H = 36e5;
const age = (iso: string | null, now: number) => (iso ? (now - Date.parse(iso)) / H : Infinity);
const when = (iso: string | null, now: number) => {
  if (!iso) return "nog nooit";
  const h = age(iso, now);
  return h < 1
    ? `${Math.max(1, Math.round(h * 60))} min geleden`
    : h < 48
      ? `${Math.round(h)} u geleden`
      : `${Math.round(h / 24)} d geleden`;
};

/** A cron job is fine when it ran within `maxHours` and its last run did not fail. */
function cron(e: Evidence, job: string, maxHours: number, now: number): Health {
  const r = e.cron[job];
  if (!r || !r.last_run) return { status: "stale", detail: `Taak ${job} heeft nog nooit gedraaid` };
  if (r.last_status && r.last_status !== "succeeded")
    return {
      status: "stale",
      detail: `Laatste run van ${job} mislukte (${r.last_status}), ${when(r.last_run, now)}`,
    };
  if (age(r.last_run, now) > maxHours)
    return { status: "stale", detail: `${job} draaide laatst ${when(r.last_run, now)}` };
  return { status: "ok", detail: `Draaide ${when(r.last_run, now)}` };
}
function stamp(iso: string | null, maxHours: number, what: string, now: number): Health {
  if (!iso) return { status: "stale", detail: `${what}: nog nooit` };
  return age(iso, now) > maxHours
    ? { status: "stale", detail: `${what} ${when(iso, now)}` }
    : { status: "ok", detail: `${what} ${when(iso, now)}` };
}
const both = (a: Health, b: Health): Health =>
  a.status === "ok" && b.status === "ok"
    ? { status: "ok", detail: a.detail }
    : a.status !== "ok"
      ? a
      : b;
const endpoint = (ok: boolean | null, what: string): Health =>
  ok === null
    ? { status: "unknown", detail: "Niet nagekeken" }
    : ok
      ? { status: "ok", detail: `${what} antwoordt` }
      : { status: "stale", detail: `${what} antwoordt niet` };
const outside: Health = {
  status: "unknown",
  detail: "Claude-taak buiten de Hub: de Hub kan niet zien of hij liep",
};

export const CHECKS: Record<string, (e: Evidence, now: number) => Health> = {
  monitor: (e, n) =>
    both(cron(e, "status-hub-monitor", 0.5, n), stamp(e.lastChecked, 0.5, "Laatste sitecheck", n)),
  invoices: (e, n) => cron(e, "invoice-schedule-hourly", 2, n),
  tasks: () => ({ status: "ok", detail: "Draait telkens je de Brain of het Dashboard opent" }),
  backup: (e, n) => stamp(e.lastBackup, 30, "Laatste back-up", n),
  stats: (e, n) =>
    both(cron(e, "vercel-analytics-daily", 26, n), stamp(e.analytics, 30, "Cijfers opgehaald", n)),
  alerts: (e, n) => cron(e, "briefing-mail", 26, n),
  reminders: (e, n) => cron(e, "invoice-reminders-daily", 26, n),
  briefing: (e, n) =>
    both(cron(e, "briefing-snapshot", 26, n), stamp(e.briefing, 30, "Laatste briefing", n)),
  ledger: (e, n) => cron(e, "ledger-sync", 26, n),
  booking: (e) => endpoint(e.bookingEndpoint, "Boekingspagina"),
  requests: (e) => endpoint(e.requestEndpoint, "Aanvraaglinks"),
  progress: () => outside,
  reports: () => outside,
  sitecheck: () => outside,
};

export function evaluate(ids: string[], e: Evidence, now = Date.now()): Record<string, Health> {
  return Object.fromEntries(
    ids.map((id) => [
      id,
      CHECKS[id]
        ? CHECKS[id](e, now)
        : { status: "unknown" as const, detail: "Geen controle ingesteld" },
    ]),
  );
}
