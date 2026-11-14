import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Database,
  ExternalLink,
  Globe,
  HardDrive,
  Lock,
  Mail,
  Pencil,
  Plus,
  RefreshCw,
  Rocket,
  Trash2,
  Webhook,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EmptyState } from "@/components/EmptyState";
import { SiteModal, DB_PROVIDERS, type SiteRow } from "@/components/SiteModal";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { runChecksNow } from "@/lib/monitoring.functions";

export const Route = createFileRoute("/_authenticated/status")({
  component: StatusPage,
});

type Site = SiteRow & {
  id: string;
  last_status: "up" | "degraded" | "down" | "unknown";
  last_checked_at: string | null;
  last_http_status: number | null;
  last_response_ms: number | null;
  last_error: string | null;
  ssl_ok: boolean | null;
  db_status: string | null;
  api_status: string | null;
  email_status: string | null;
  last_deploy_state: string | null;
  last_deploy_at: string | null;
  last_deploy_url: string | null;
  last_backup_at: string | null;
  clients?: { name: string } | null;
};

type Incident = {
  id: string;
  site_id: string;
  kind: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string | null;
  status: "open" | "resolved";
  opened_at: string;
  resolved_at: string | null;
};

type BackupRun = {
  target: string;
  ok: boolean;
  at: string;
  rows: number | null;
  bytes: number | null;
  error: string | null;
  stale: boolean;
};
const BACKUP_TARGETS: Record<string, string> = {
  hub: "Solyn Hub OS",
  riory: "Riory BV",
  "villa-amano": "Villa Amano",
};

type Check = {
  id: number;
  kind: string;
  target: string | null;
  ok: boolean;
  status_code: number | null;
  response_ms: number | null;
  error: string | null;
  checked_at: string;
};

const STATUS_STYLE: Record<Site["last_status"], { color: string; label: string }> = {
  up: { color: "#1D9E75", label: "Online" },
  degraded: { color: "#D97706", label: "Issues" },
  down: { color: "#DC2626", label: "Offline" },
  unknown: { color: "#6B7280", label: "Not checked" },
};
const SEV_COLOR: Record<Incident["severity"], string> = {
  critical: "#DC2626",
  warning: "#D97706",
  info: "#1D9E75",
};

// The generated DB types don't know the new tables yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

function ago(iso?: string | null): string {
  if (!iso) return "never";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}
function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function StatusPage() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const runFn = useServerFn(runChecksNow);
  const navigate = useNavigate();

  const [sites, setSites] = useState<Site[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Site | null>(null);
  const [detail, setDetail] = useState<Site | null>(null);
  const [backups, setBackups] = useState<BackupRun[]>([]);

  const load = useCallback(async () => {
    const [s, i, c, b] = await Promise.all([
      db.from("monitored_sites").select("*, clients:client_id(name)").order("name"),
      db.from("incidents").select("*").order("opened_at", { ascending: false }).limit(60),
      supabase.from("clients").select("id,name").order("name"),
      db.rpc("backup_status"),
    ]);
    setBackups((b.data as BackupRun[]) ?? []);
    if (s.error) toast.error(s.error.message);
    setSites((s.data as Site[]) ?? []);
    setIncidents((i.data as Incident[]) ?? []);
    setClients((c.data as { id: string; name: string }[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    const ch = supabase
      .channel("status-hub")
      .on("postgres_changes", { event: "*", schema: "public", table: "monitored_sites" }, () =>
        load(),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "incidents" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);

  // Keep the detail sheet in sync with fresh data.
  useEffect(() => {
    if (detail) setDetail(sites.find((s) => s.id === detail.id) ?? null);
  }, [sites]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = useMemo(() => incidents.filter((i) => i.status === "open"), [incidents]);
  const history = useMemo(
    () => incidents.filter((i) => i.status === "resolved").slice(0, 20),
    [incidents],
  );
  const counts = useMemo(
    () => ({
      up: sites.filter((s) => s.enabled && s.last_status === "up").length,
      issues: sites.filter(
        (s) => s.enabled && (s.last_status === "degraded" || s.last_status === "down"),
      ).length,
      critical: open.filter((i) => i.severity === "critical").length,
    }),
    [sites, open],
  );
  const siteName = (id: string) => sites.find((s) => s.id === id)?.name ?? "—";

  async function run(siteId?: string) {
    setRunning(true);
    try {
      const r = await runFn({ data: { siteId } });
      toast.success(
        `Checked ${r.checked} site${r.checked === 1 ? "" : "s"}` +
          (r.opened ? ` · ${r.opened} new alert${r.opened === 1 ? "" : "s"}` : "") +
          (r.resolved ? ` · ${r.resolved} resolved` : ""),
      );
      if (r.errors.length) toast.error(r.errors.join("\n"));
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  async function del(s: Site) {
    if (!confirm(`Stop monitoring "${s.name}" and delete its history?`)) return;
    const { error } = await db.from("monitored_sites").delete().eq("id", s.id);
    if (error) return toast.error(error.message);
    toast.success("Site removed");
    setDetail(null);
    load();
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl xl:max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h1 className="text-2xl font-semibold">Status</h1>
        {isAdmin && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => run()}
              disabled={running || !sites.length}
              className="rounded-full h-10 px-3 gap-2"
              aria-label="Run checks"
            >
              <RefreshCw className={`w-4 h-4 ${running ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">{running ? "Checking…" : "Run checks"}</span>
            </Button>
            <Button
              onClick={() => {
                setEditing(null);
                setModalOpen(true);
              }}
              className="gap-2 bg-white text-black hover:bg-white/90 rounded-full h-10 px-4"
            >
              <Plus className="w-4 h-4" /> Site
            </Button>
          </div>
        )}
      </div>

      {/* Summary */}
      <HealthBanner sites={sites} counts={counts} />

      {/* Open alerts */}
      {open.length > 0 && (
        <Section
          icon={<AlertTriangle className="w-4 h-4" />}
          title={`Active alerts (${open.length})`}
        >
          <div className="space-y-2">
            {open.map((i) => (
              <IncidentRow key={i.id} i={i} site={siteName(i.site_id)} />
            ))}
          </div>
        </Section>
      )}

      {/* Sites */}
      <Section icon={<Activity className="w-4 h-4" />} title="Clients">
        {loading ? (
          <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
        ) : sites.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="No sites monitored yet"
            description="Add a client website to start checking it."
          />
        ) : (
          <div className="grid gap-2 md:gap-3 md:grid-cols-2 xl:grid-cols-3">
            {sites.map((s) => (
              <SiteCard
                key={s.id}
                s={s}
                openCount={open.filter((i) => i.site_id === s.id).length}
                onOpen={() => navigate({ to: "/status/$id", params: { id: s.id } })}
              />
            ))}
          </div>
        )}
      </Section>

      {/* Off-site backups */}
      <Section icon={<HardDrive className="w-4 h-4" />} title="Off-site backups">
        <BackupList runs={backups} />
      </Section>

      {/* History */}
      {history.length > 0 && (
        <Section icon={<CheckCircle2 className="w-4 h-4" />} title="Incident history">
          <div className="space-y-2">
            {history.map((i) => (
              <IncidentRow key={i.id} i={i} site={siteName(i.site_id)} />
            ))}
          </div>
        </Section>
      )}

      <SiteDetail
        site={detail}
        incidents={incidents.filter((i) => detail && i.site_id === detail.id)}
        isAdmin={isAdmin}
        running={running}
        onClose={() => setDetail(null)}
        onRun={() => detail && run(detail.id)}
        onEdit={() => {
          if (detail) {
            setEditing(detail);
            setModalOpen(true);
          }
        }}
        onDelete={() => detail && del(detail)}
      />

      <SiteModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        initial={editing ?? undefined}
        clients={clients}
        onSaved={load}
      />
    </div>
  );
}

function BackupList({ runs }: { runs: BackupRun[] }) {
  const byTarget = new Map(runs.map((r) => [r.target, r]));
  const targets = Array.from(new Set([...Object.keys(BACKUP_TARGETS), ...byTarget.keys()]));
  return (
    <div className="rounded-xl border border-border bg-card divide-y divide-border">
      {targets.map((t) => {
        const r = byTarget.get(t);
        const color = !r ? "#6B7280" : !r.ok ? "#DC2626" : r.stale ? "#D97706" : "#1D9E75";
        const label = !r ? "No backup yet" : !r.ok ? "Failed" : r.stale ? "Overdue" : "OK";
        return (
          <div key={t} className="flex items-center gap-3 p-3">
            <Dot color={color} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{BACKUP_TARGETS[t] ?? t}</div>
              <div className="text-xs text-muted-foreground truncate">
                {r
                  ? `${ago(r.at)} · ${(r.rows ?? 0).toLocaleString()} rows · ${((r.bytes ?? 0) / 1024 / 1024).toFixed(1)} MB encrypted`
                  : "Runs nightly at 03:07"}
                {r?.error ? ` · ${r.error}` : ""}
              </div>
            </div>
            <span className="text-xs font-medium" style={{ color }}>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function HealthBanner({
  sites,
  counts,
}: {
  sites: Site[];
  counts: { up: number; issues: number; critical: number };
}) {
  const tone = counts.critical ? "tone-red" : counts.issues ? "tone-amber" : "tone-emerald";
  const last = sites.reduce<string | null>(
    (m, x) => (x.last_checked_at && (!m || x.last_checked_at > m) ? x.last_checked_at : m),
    null,
  );
  const speeds = sites.map((x) => x.last_response_ms).filter((v): v is number => v != null);
  const avg = speeds.length ? Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length) : null;
  return (
    <div className={`tone ${tone} rounded-2xl border p-4 mb-4 md:mb-6`}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="flex items-baseline gap-1.5">
            <span className={`text-4xl font-bold tabular-nums leading-none ${counts.critical || counts.issues ? "" : "ink-emerald"}`}>
              {counts.up}
            </span>
            <span className="text-lg text-muted-foreground tabular-nums">/ {sites.length}</span>
            <span className="text-sm text-muted-foreground ml-1">online</span>
          </div>
          <div className="text-xs text-muted-foreground mt-1.5">
            {counts.critical
              ? `${counts.critical} critical alert${counts.critical === 1 ? "" : "s"}`
              : counts.issues
                ? `${counts.issues} site${counts.issues === 1 ? "" : "s"} with issues`
                : "No issues"}
            {last ? ` · checked ${ago(last)}` : ""}
          </div>
        </div>
        {avg != null && (
          <div className="text-right shrink-0">
            <div className="text-lg font-semibold tabular-nums leading-none">{avg} ms</div>
            <div className="text-[11px] text-muted-foreground mt-1">average response</div>
          </div>
        )}
      </div>
      {sites.length > 0 && (
        <div className="flex gap-1 mt-3" aria-hidden>
          {sites.map((x) => (
            <span
              key={x.id}
              className="h-1.5 flex-1 rounded-full"
              style={{ backgroundColor: STATUS_STYLE[x.enabled ? x.last_status : "unknown"].color }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="mb-4 md:mb-6">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 md:mb-3">
        {icon} {title}
      </div>
      {children}
    </div>
  );
}

function Dot({ color, size = 10 }: { color: string; size?: number }) {
  return (
    <span
      className="inline-block rounded-full shrink-0"
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        boxShadow: `0 0 0 3px ${color}26`,
      }}
    />
  );
}

type Pill = { icon: typeof Globe; label: string; state: "ok" | "fail" | "off" | "warn" };
const PILL_COLOR = { ok: "#1D9E75", fail: "#DC2626", warn: "#D97706", off: "#6B7280" };

function pillsFor(s: Site): Pill[] {
  const st = (v: string | null | undefined): Pill["state"] =>
    v === "ok" ? "ok" : v === "fail" || v === "issues" ? "fail" : "off";
  const deploy: Pill["state"] = !s.last_deploy_state
    ? "off"
    : ["ERROR", "CANCELED"].includes(s.last_deploy_state)
      ? "fail"
      : s.last_deploy_state === "READY"
        ? "ok"
        : "warn";
  const backupAge = s.last_backup_at ? Date.now() - new Date(s.last_backup_at).getTime() : null;
  const backup: Pill["state"] =
    backupAge === null ? "off" : backupAge < 26 * 3600_000 ? "ok" : "warn";
  return [
    {
      icon: Globe,
      label: "Site",
      state:
        s.last_status === "unknown"
          ? "off"
          : s.last_status === "down"
            ? "fail"
            : (s.last_response_ms ?? 0) > 4000
              ? "warn"
              : "ok",
    },
    { icon: Lock, label: "HTTPS", state: s.ssl_ok === null ? "off" : s.ssl_ok ? "ok" : "fail" },
    { icon: Database, label: "DB", state: st(s.db_status) },
    { icon: Webhook, label: "API", state: st(s.api_status) },
    // Deploy status comes from Vercel; sites hosted elsewhere have nothing to report, so no pill.
    ...(s.vercel_project_id || s.last_deploy_state ? [{ icon: Rocket, label: "Deploy", state: deploy } as Pill] : []),
    { icon: Mail, label: "Email", state: st(s.email_status) },
    { icon: HardDrive, label: "Backup", state: backup },
  ];
}

function SiteCard({ s, openCount, onOpen }: { s: Site; openCount: number; onOpen: () => void }) {
  const style = STATUS_STYLE[s.enabled ? s.last_status : "unknown"];
  const ms = s.last_response_ms;
  const msColor = ms == null ? undefined : ms > 4000 ? "#D97706" : ms < 600 ? "#34D399" : undefined;
  return (
    <button
      onClick={onOpen}
      className="text-left rounded-xl border border-border bg-card px-3.5 py-2.5 hover:border-primary/50 transition w-full"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Dot color={style.color} />
          <span className="font-semibold truncate">{s.name}</span>
          <span className="hidden md:inline text-xs text-muted-foreground truncate">{hostOf(s.url)}</span>
          {openCount > 0 ? (
            <span className="text-[11px] shrink-0" style={{ color: "#DC2626" }}>
              {openCount} alert{openCount === 1 ? "" : "s"}
            </span>
          ) : (
            s.is_critical && (
              <span className="text-[11px] shrink-0 rounded-full border border-border px-1.5 py-px text-muted-foreground">
                bookings
              </span>
            )
          )}
        </div>
        <div className="text-right shrink-0 text-sm tabular-nums font-medium" style={{ color: s.enabled ? msColor : undefined }}>
          {!s.enabled ? "Paused" : s.last_status === "down" ? style.label : ms != null ? `${ms} ms` : style.label}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 mt-1.5">
        <div className="flex flex-wrap gap-1">
          {pillsFor(s).map((p) => (
            <span
              key={p.label}
              title={p.label}
              aria-label={`${p.label}: ${p.state}`}
              className="inline-flex items-center justify-center gap-1 h-6 min-w-6 px-1.5 rounded-full text-[11px]"
              style={{ backgroundColor: `${PILL_COLOR[p.state]}1A`, color: PILL_COLOR[p.state] }}
            >
              <p.icon className="w-3 h-3" /> <span className="hidden md:inline">{p.label}</span>
            </span>
          ))}
        </div>
        <span className="text-[11px] text-muted-foreground truncate md:hidden">{hostOf(s.url)}</span>
      </div>
    </button>
  );
}

function IncidentRow({ i, site }: { i: Incident; site: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 flex gap-3">
      <span
        className="w-1 rounded-full shrink-0"
        style={{ backgroundColor: i.status === "resolved" ? "#6B7280" : SEV_COLOR[i.severity] }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium truncate">{i.title}</span>
          <span
            className="text-[11px] uppercase font-semibold shrink-0"
            style={{ color: SEV_COLOR[i.severity] }}
          >
            {i.severity}
          </span>
        </div>
        <div className="text-[11px] text-muted-foreground mt-0.5">
          {site} · opened {ago(i.opened_at)}
          {i.resolved_at ? ` · resolved ${ago(i.resolved_at)}` : ""}
        </div>
        {i.status === "open" && i.detail && (
          <div className="text-xs text-muted-foreground mt-1 break-words line-clamp-2">
            {i.detail}
          </div>
        )}
      </div>
    </div>
  );
}

function SiteDetail({
  site,
  incidents,
  isAdmin,
  running,
  onClose,
  onRun,
  onEdit,
  onDelete,
}: {
  site: Site | null;
  incidents: Incident[];
  isAdmin: boolean;
  running: boolean;
  onClose: () => void;
  onRun: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [checks, setChecks] = useState<Check[]>([]);
  useEffect(() => {
    if (!site) return;
    db.from("health_checks")
      .select("*")
      .eq("site_id", site.id)
      .order("checked_at", { ascending: false })
      .limit(60)
      .then(({ data }: { data: Check[] | null }) => setChecks(data ?? []));
  }, [site?.id, site?.last_checked_at]); // eslint-disable-line react-hooks/exhaustive-deps

  const http = checks
    .filter((c) => c.kind === "http")
    .slice(0, 30)
    .reverse();
  const uptime = http.length
    ? Math.round((http.filter((c) => c.ok).length / http.length) * 100)
    : null;
  const latest = useMemo(() => {
    const seen = new Set<string>();
    return checks.filter((c) => {
      const k = `${c.kind}:${c.target}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [checks]);

  return (
    <Sheet open={!!site} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="bottom"
        className="max-h-[90vh] overflow-y-auto rounded-t-2xl sm:max-w-2xl sm:mx-auto"
      >
        {site && (
          <>
            <SheetHeader className="text-left">
              <SheetTitle className="flex items-center gap-2">
                <Dot color={STATUS_STYLE[site.last_status].color} /> {site.name}
              </SheetTitle>
              <a
                href={site.url}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-muted-foreground inline-flex items-center gap-1"
              >
                {site.url} <ExternalLink className="w-3 h-3" />
              </a>
            </SheetHeader>

            <div className="grid grid-cols-2 gap-2 mt-4 text-sm">
              <Info label="Client" value={site.clients?.name ?? "—"} />
              <Info label="Hosting" value={site.hosting_provider} />
              <Info label="Database" value={DB_PROVIDERS[site.db_provider] ?? site.db_provider} />
              <Info label="Repo" value={site.repo ?? "—"} />
              <Info label="Last check" value={ago(site.last_checked_at)} />
              <Info label="Uptime (last 30)" value={uptime === null ? "—" : `${uptime}%`} />
              <Info
                label="Last deploy"
                value={
                  site.last_deploy_state
                    ? `${site.last_deploy_state} · ${ago(site.last_deploy_at)}`
                    : "Not connected"
                }
              />
              <Info
                label="Last backup"
                value={site.last_backup_at ? ago(site.last_backup_at) : "Not set up yet"}
              />
            </div>

            {http.length > 1 && (
              <div className="mt-4">
                <div className="text-xs text-muted-foreground mb-1">Response time</div>
                <div className="flex items-end gap-[2px] h-12">
                  {http.map((c) => {
                    const h = c.ok
                      ? Math.max(8, Math.min(100, ((c.response_ms ?? 0) / 4000) * 100))
                      : 100;
                    return (
                      <div
                        key={c.id}
                        title={`${c.response_ms ?? "–"} ms`}
                        className="flex-1 rounded-sm"
                        style={{
                          height: `${h}%`,
                          backgroundColor: c.ok
                            ? (c.response_ms ?? 0) > 4000
                              ? "#D97706"
                              : "#1D9E75"
                            : "#DC2626",
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mt-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Latest results
              </div>
              {latest.length === 0 ? (
                <div className="text-sm text-muted-foreground">No checks yet.</div>
              ) : (
                <div className="space-y-1.5">
                  {latest.map((c) => (
                    <div key={c.id} className="flex items-start gap-2 text-xs">
                      {c.ok ? (
                        <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: "#1D9E75" }} />
                      ) : (
                        <XCircle className="w-4 h-4 shrink-0" style={{ color: "#DC2626" }} />
                      )}
                      <div className="min-w-0">
                        <span className="uppercase font-semibold mr-1">{c.kind}</span>
                        <span className="text-muted-foreground break-all">{c.target}</span>
                        <div className="text-muted-foreground">
                          {c.status_code ? `HTTP ${c.status_code}` : ""}
                          {c.response_ms != null ? ` · ${c.response_ms} ms` : ""}
                          {c.error ? ` · ${c.error}` : ""}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {incidents.length > 0 && (
              <div className="mt-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Incidents
                </div>
                <div className="space-y-2">
                  {incidents.slice(0, 10).map((i) => (
                    <IncidentRow key={i.id} i={i} site={site.name} />
                  ))}
                </div>
              </div>
            )}

            {isAdmin && (
              <div className="flex gap-2 mt-6 pb-2">
                <Button onClick={onRun} disabled={running} className="flex-1 gap-2">
                  <RefreshCw className={`w-4 h-4 ${running ? "animate-spin" : ""}`} /> Check now
                </Button>
                <Button variant="outline" onClick={onEdit} className="gap-2">
                  <Pencil className="w-4 h-4" /> Edit
                </Button>
                <Button variant="outline" onClick={onDelete} aria-label="Delete">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/40 p-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="truncate">{value}</div>
    </div>
  );
}
