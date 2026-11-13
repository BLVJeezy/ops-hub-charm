// Pure monitoring logic — no database, no env. Unit-tested in checks.test.ts.

export type CheckKind = "http" | "api" | "db" | "deploy" | "email";
export type Severity = "critical" | "warning" | "info";
export type SiteStatus = "up" | "degraded" | "down" | "unknown";

export type CheckResult = {
  kind: CheckKind;
  target: string;
  ok: boolean;
  status_code: number | null;
  response_ms: number | null;
  error: string | null;
};

export type ApiEndpoint = { label?: string; url: string; expect_status?: number };

export const SLOW_MS = 4000;
export const TIMEOUT_MS = 10000;
export const CRITICAL_RENOTIFY_HOURS = 6;

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * GET a URL with a timeout. One retry on failure so a single blip
 * does not open an incident.
 */
export async function checkUrl(
  kind: CheckKind,
  url: string,
  opts: {
    headers?: Record<string, string>;
    expectStatus?: number;
    fetchImpl?: FetchLike;
    retryDelayMs?: number;
  } = {},
): Promise<CheckResult> {
  const first = await checkUrlOnce(kind, url, opts);
  if (first.ok) return first;
  await new Promise((r) => setTimeout(r, opts.retryDelayMs ?? 2000));
  return checkUrlOnce(kind, url, opts);
}

async function checkUrlOnce(
  kind: CheckKind,
  url: string,
  opts: { headers?: Record<string, string>; expectStatus?: number; fetchImpl?: FetchLike },
): Promise<CheckResult> {
  const doFetch = opts.fetchImpl ?? (fetch as FetchLike);
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await doFetch(url, {
      method: "GET",
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "user-agent": "SolynStatusHub/1.0 (+https://solynglobal.be)",
        ...(opts.headers ?? {}),
      },
    });
    const ms = Date.now() - started;
    let ok = opts.expectStatus
      ? res.status === opts.expectStatus
      : res.status >= 200 && res.status < 400;
    let error: string | null = ok ? null : `HTTP ${res.status}`;

    // JSON health endpoints may report failure in the body: { ok:false } or { store:false }
    const ct = res.headers.get("content-type") ?? "";
    if (ok && kind !== "http" && ct.includes("application/json")) {
      try {
        const body = (await res.json()) as Record<string, unknown>;
        if (body && (body.ok === false || body.store === false || body.status === "error")) {
          ok = false;
          error = "Health endpoint reported a failure";
        }
      } catch {
        /* non-JSON body is fine */
      }
    } else {
      // Release the body without reading it.
      res.body?.cancel().catch(() => {});
    }
    return { kind, target: url, ok, status_code: res.status, response_ms: ms, error };
  } catch (e) {
    const ms = Date.now() - started;
    const msg =
      e instanceof Error
        ? e.name === "AbortError"
          ? `Timeout after ${TIMEOUT_MS / 1000}s`
          : e.message
        : String(e);
    return { kind, target: url, ok: false, status_code: null, response_ms: ms, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

/** Headers for a Supabase-style health URL. Refuses anything that looks like a secret key. */
export function dbHealthHeaders(apikey?: string | null): Record<string, string> {
  if (!apikey) return {};
  if (isSecretKey(apikey))
    throw new Error("Refusing to use a secret/service-role key for health checks");
  const h: Record<string, string> = { apikey };
  if (apikey.startsWith("eyJ")) h.Authorization = `Bearer ${apikey}`;
  return h;
}

/** True for Supabase secret keys and service_role JWTs. */
export function isSecretKey(key: string): boolean {
  if (key.startsWith("sb_secret_")) return true;
  if (key.startsWith("eyJ")) {
    try {
      const part = key.split(".")[1] ?? "";
      const json = atob(
        part
          .replace(/-/g, "+")
          .replace(/_/g, "/")
          .padEnd(Math.ceil(part.length / 4) * 4, "="),
      );
      return /"role"\s*:\s*"service_role"/.test(json);
    } catch {
      return false;
    }
  }
  return false;
}

export function overallStatus(results: CheckResult[]): SiteStatus {
  const http = results.find((r) => r.kind === "http");
  if (!http) return "unknown";
  if (!http.ok) return "down";
  const otherFail = results.some((r) => r.kind !== "http" && !r.ok);
  const slow = (http.response_ms ?? 0) > SLOW_MS;
  return otherFail || slow ? "degraded" : "up";
}

/** Severity of a failing check, per the spec's alert levels. */
export function severityFor(kind: CheckKind, isCritical: boolean): Severity {
  if (kind === "http") return "critical";
  if (kind === "db" || kind === "api") return isCritical ? "critical" : "warning";
  return "warning"; // deploy, email
}

export function incidentTitle(kind: CheckKind, siteName: string): string {
  switch (kind) {
    case "http":
      return `${siteName} is offline`;
    case "api":
      return `${siteName}: API endpoint failing`;
    case "db":
      return `${siteName}: database not responding`;
    case "deploy":
      return `${siteName}: production deployment failed`;
    case "email":
      return `${siteName}: email delivery problems`;
  }
}

export type OpenIncident = {
  id: string;
  kind: CheckKind;
  severity: Severity;
  last_notified_at: string | null;
};

export type IncidentAction =
  | { type: "open"; kind: CheckKind; severity: Severity; detail: string }
  | { type: "renotify"; id: string; kind: CheckKind; severity: Severity; detail: string }
  | { type: "resolve"; id: string; kind: CheckKind };

/**
 * Compare this run's results per kind with open incidents.
 * - failing kind, no open incident  → open (+ notify)
 * - failing kind, open critical, last notified > 6h ago → renotify
 * - passing kind with open incident → resolve (+ info notify)
 */
export function decideIncidents(
  results: CheckResult[],
  open: OpenIncident[],
  isCritical: boolean,
  now: Date = new Date(),
): IncidentAction[] {
  const actions: IncidentAction[] = [];
  const byKind = new Map<CheckKind, CheckResult[]>();
  for (const r of results) byKind.set(r.kind, [...(byKind.get(r.kind) ?? []), r]);

  for (const [kind, rs] of byKind) {
    const failing = rs.filter((r) => !r.ok);
    const existing = open.find((o) => o.kind === kind);
    if (failing.length) {
      const detail = failing.map((f) => `${f.target}: ${f.error ?? "failed"}`).join("\n");
      if (!existing) {
        actions.push({ type: "open", kind, severity: severityFor(kind, isCritical), detail });
      } else if (existing.severity === "critical") {
        const last = existing.last_notified_at ? new Date(existing.last_notified_at).getTime() : 0;
        if (now.getTime() - last > CRITICAL_RENOTIFY_HOURS * 3600_000) {
          actions.push({
            type: "renotify",
            id: existing.id,
            kind,
            severity: existing.severity,
            detail,
          });
        }
      }
    } else if (existing) {
      actions.push({ type: "resolve", id: existing.id, kind });
    }
  }
  return actions;
}

/** Is a site due for a check, given its interval? */
export function isDue(
  lastCheckedAt: string | null,
  intervalMinutes: number,
  now: Date = new Date(),
): boolean {
  if (!lastCheckedAt) return true;
  // 30s grace so a cron running every 5 min does not skip a 5-min site.
  return now.getTime() - new Date(lastCheckedAt).getTime() >= intervalMinutes * 60_000 - 30_000;
}

/** Map a Vercel deployment state to a check result. */
export function deployResult(
  projectId: string,
  dep: { state?: string; readyState?: string; url?: string } | null,
): CheckResult {
  const state = (dep?.state ?? dep?.readyState ?? "UNKNOWN").toUpperCase();
  const ok = state !== "ERROR" && state !== "CANCELED";
  return {
    kind: "deploy",
    target: projectId,
    ok,
    status_code: null,
    response_ms: null,
    error: ok ? null : `Latest production deployment is ${state}`,
  };
}

/** Resend webhook types that count as delivery problems. */
export const EMAIL_PROBLEM_TYPES = [
  "email.bounced",
  "email.failed",
  "email.complained",
  "email.delivery_delayed",
] as const;

export function emailResult(domain: string, problemCount: number, threshold = 1): CheckResult {
  const ok = problemCount < threshold;
  return {
    kind: "email",
    target: domain,
    ok,
    status_code: null,
    response_ms: null,
    error: ok ? null : `${problemCount} bounced/failed email(s) in the last 24h`,
  };
}

/** Extract the sending domain from a Resend "from" field like `Name <a@b.be>`. */
export function fromDomain(from: unknown): string | null {
  if (typeof from !== "string") return null;
  const m = /@([A-Za-z0-9.-]+)>?\s*$/.exec(from.trim());
  return m ? m[1].toLowerCase() : null;
}

export function parseEndpoints(raw: unknown): ApiEndpoint[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (e): e is ApiEndpoint =>
        !!e && typeof e === "object" && typeof (e as ApiEndpoint).url === "string",
    )
    .filter((e) => /^https:\/\//.test(e.url));
}
