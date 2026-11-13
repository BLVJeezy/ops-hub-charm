import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft, BarChart3, Copy, Users, CheckCircle2, Database, ExternalLink, FileText, Folder, Github, Globe,
  Info, Pencil, RefreshCw, Trash2, Wallet, XCircle,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SiteModal, DB_PROVIDERS, type SiteRow } from "@/components/SiteModal";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { runChecksNow } from "@/lib/monitoring.functions";
import { getSitePages } from "@/lib/site-data.functions";
import { mttrMinutes, shiftDay, summarise, type DailyRow } from "@/lib/site-stats";
import { visitTotals, type VisitDay } from "@/lib/visits";
import { brusselsToday } from "@/lib/invoice-schedule";
import { formatCurrency, formatDate } from "@/lib/format";
import { formatInvoiceNumber } from "@/lib/invoice-code";

export const Route = createFileRoute("/_authenticated/status_/$id")({
  component: SiteFolder,
});

// New tables/functions are not in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

type Site = SiteRow & {
  id: string;
  last_status: "up" | "degraded" | "down" | "unknown";
  last_checked_at: string | null;
  last_response_ms: number | null;
  last_http_status: number | null;
  last_error: string | null;
  ssl_ok: boolean | null;
  db_status: string | null;
  api_status: string | null;
  email_status: string | null;
  last_deploy_state: string | null;
  last_deploy_at: string | null;
  last_backup_at: string | null;
  clients?: { name: string } | null;
};
type Incident = { id: string; kind: string; severity: string; title: string; status: string; opened_at: string; resolved_at: string | null };
type Invoice = { id: string; invoice_number: number; date: string; total: number; status: string; line_items: Array<{ description?: string }> };

const STATUS = {
  up: { color: "#1D9E75", label: "Online" },
  degraded: { color: "#D97706", label: "Problemen" },
  down: { color: "#DC2626", label: "Offline" },
  unknown: { color: "#6B7280", label: "Nog niet gecontroleerd" },
} as const;
const KIND_LABEL: Record<string, string> = { http: "Website", api: "API", db: "Database", deploy: "Deploy", email: "E-mail" };
const PERIODS = [7, 30, 90] as const;

function ago(iso?: string | null) {
  if (!iso) return "nooit";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "net nu";
  if (s < 3600) return `${Math.round(s / 60)} min geleden`;
  if (s < 86400) return `${Math.round(s / 3600)} u geleden`;
  return `${Math.round(s / 86400)} d geleden`;
}

function SiteFolder() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const runFn = useServerFn(runChecksNow);

  const [site, setSite] = useState<Site | null>(null);
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    const [s, c] = await Promise.all([
      db.from("monitored_sites").select("*, clients:client_id(name)").eq("id", id).maybeSingle(),
      supabase.from("clients").select("id,name").order("name"),
    ]);
    if (s.error) toast.error(s.error.message);
    setSite(s.data ?? null);
    setClients((c.data as { id: string; name: string }[]) ?? []);
    setLoading(false);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function run() {
    setRunning(true);
    try {
      await runFn({ data: { siteId: id } });
      toast.success("Gecontroleerd");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally { setRunning(false); }
  }
  async function del() {
    if (!site || !confirm(`"${site.name}" niet meer opvolgen en de geschiedenis wissen?`)) return;
    const { error } = await db.from("monitored_sites").delete().eq("id", id);
    if (error) return toast.error(error.message);
    navigate({ to: "/status" });
  }

  if (loading) return <div className="p-8 text-center text-sm text-muted-foreground">Laden…</div>;
  if (!site) return (
    <div className="p-6 max-w-3xl mx-auto">
      <BackLink />
      <p className="text-sm text-muted-foreground mt-6">Deze site bestaat niet (meer).</p>
    </div>
  );

  const st = STATUS[site.enabled ? site.last_status : "unknown"];

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <BackLink />
      <div className="flex items-start justify-between gap-3 mt-3 mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            <Folder className="w-3.5 h-3.5" /> Klantmap
          </div>
          <h1 className="text-2xl font-semibold truncate flex items-center gap-2 mt-1">
            <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: st.color }} />
            {site.name}
          </h1>
          <div className="text-xs text-muted-foreground mt-1">
            <span style={{ color: st.color }}>{site.enabled ? st.label : "Gepauzeerd"}</span> · gecontroleerd {ago(site.last_checked_at)}
          </div>
        </div>
        {isAdmin && (
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="icon" onClick={run} disabled={running} title="Nu controleren">
              <RefreshCw className={`w-4 h-4 ${running ? "animate-spin" : ""}`} />
            </Button>
            <Button variant="outline" size="icon" onClick={() => setEditOpen(true)} title="Bewerken"><Pencil className="w-4 h-4" /></Button>
          </div>
        )}
      </div>

      <Tabs defaultValue="overzicht">
        <TabsList className="w-full grid grid-cols-5 mb-4">
          <TabsTrigger value="overzicht" className="text-xs px-1"><Info className="w-3.5 h-3.5 sm:mr-1" /><span className="hidden sm:inline">Overzicht</span></TabsTrigger>
          <TabsTrigger value="stats" className="text-xs px-1"><BarChart3 className="w-3.5 h-3.5 sm:mr-1" /><span className="hidden sm:inline">Statistieken</span></TabsTrigger>
          <TabsTrigger value="paginas" className="text-xs px-1"><Globe className="w-3.5 h-3.5 sm:mr-1" /><span className="hidden sm:inline">Pagina's</span></TabsTrigger>
          <TabsTrigger value="data" className="text-xs px-1"><Database className="w-3.5 h-3.5 sm:mr-1" /><span className="hidden sm:inline">Data</span></TabsTrigger>
          <TabsTrigger value="fin" className="text-xs px-1"><Wallet className="w-3.5 h-3.5 sm:mr-1" /><span className="hidden sm:inline">Financieel</span></TabsTrigger>
        </TabsList>

        <TabsContent value="overzicht"><Overview site={site} /></TabsContent>
        <TabsContent value="stats"><Visitors siteId={site.id} /><Stats siteId={site.id} /></TabsContent>
        <TabsContent value="paginas"><Pages siteId={site.id} /></TabsContent>
        <TabsContent value="data"><DataSources site={site} /></TabsContent>
        <TabsContent value="fin"><Finance clientId={site.client_id} clientName={site.clients?.name ?? null} /></TabsContent>
      </Tabs>

      {isAdmin && (
        <div className="mt-8 pt-4 border-t border-border">
          <Button variant="ghost" size="sm" onClick={del} className="text-muted-foreground gap-2"><Trash2 className="w-4 h-4" /> Site niet meer opvolgen</Button>
        </div>
      )}
      <SiteModal open={editOpen} onOpenChange={setEditOpen} initial={site} clients={clients} onSaved={load} />
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/status" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="w-4 h-4" /> Status
    </Link>
  );
}

function Card({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 mb-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">{icon}{title}</div>
      {children}
    </div>
  );
}
function Kv({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg bg-muted/40 p-2 min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="truncate text-sm">{value}</div>
    </div>
  );
}
function Kpi({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="text-xl font-bold" style={color ? { color } : undefined}>{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}
function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs hover:border-primary/60">
      {children} <ExternalLink className="w-3 h-3 opacity-60" />
    </a>
  );
}

// ---------- Overzicht ----------
function Overview({ site }: { site: Site }) {
  const state = (v: string | null | undefined) => v === "ok" ? "OK" : v === "fail" || v === "issues" ? "Probleem" : "Niet ingesteld";
  return (
    <>
      <Card title="Snel openen">
        <div className="flex flex-wrap gap-2">
          <Ext href={site.url}><Globe className="w-3.5 h-3.5" /> Website</Ext>
          {site.repo && <Ext href={`https://github.com/${site.repo}`}><Github className="w-3.5 h-3.5" /> {site.repo}</Ext>}
          {site.hosting_provider === "Vercel" && <Ext href="https://vercel.com/dashboard">Vercel</Ext>}
          {(site.hosting_provider === "Lovable" || site.db_provider === "lovable_cloud") && <Ext href="https://lovable.dev/dashboard">Lovable</Ext>}
          <Ext href={`https://search.google.com/search-console?resource_id=${encodeURIComponent(new URL(site.url).origin + "/")}`}>Search Console</Ext>
        </div>
      </Card>
      <Card title="Gegevens">
        <div className="grid grid-cols-2 gap-2">
          <Kv label="Klant" value={site.clients?.name ?? "—"} />
          <Kv label="Hosting" value={site.hosting_provider} />
          <Kv label="Database" value={DB_PROVIDERS[site.db_provider] ?? site.db_provider} />
          <Kv label="Controle" value={`elke ${site.check_interval_minutes < 60 ? `${site.check_interval_minutes} min` : `${site.check_interval_minutes / 60} u`}`} />
          <Kv label="Kritiek systeem" value={site.is_critical ? "Ja (boekingen)" : "Nee"} />
          <Kv label="E-maildomein" value={site.email_domain ?? "—"} />
        </div>
      </Card>
      <Card title="Laatste controle">
        <div className="grid grid-cols-2 gap-2">
          <Kv label="Website" value={site.last_http_status ? `HTTP ${site.last_http_status} · ${site.last_response_ms} ms` : "—"} />
          <Kv label="HTTPS" value={site.ssl_ok == null ? "—" : site.ssl_ok ? "OK" : "Probleem"} />
          <Kv label="Database" value={state(site.db_status)} />
          <Kv label="API" value={state(site.api_status)} />
          <Kv label="E-mail" value={state(site.email_status)} />
          <Kv label="Laatste deploy" value={site.last_deploy_state ? `${site.last_deploy_state} · ${ago(site.last_deploy_at)}` : "Niet gekoppeld"} />
          <Kv label="Laatste back-up" value={site.last_backup_at ? ago(site.last_backup_at) : "Nog niet ingesteld"} />
        </div>
        {site.last_error && <p className="text-xs text-red-400 mt-3 break-words">{site.last_error}</p>}
      </Card>
      <TrackingSnippet trackingId={(site as Site & { tracking_id?: string }).tracking_id} />
      {site.notes && <Card title="Notities"><p className="text-sm whitespace-pre-wrap">{site.notes}</p></Card>}
    </>
  );
}

// ---------- Statistieken ----------
function Stats({ siteId }: { siteId: string }) {
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const [rows, setRows] = useState<DailyRow[] | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [emailCounts, setEmailCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    let off = false;
    (async () => {
      const since = new Date(Date.now() - 90 * 86400_000).toISOString();
      const [s, i] = await Promise.all([
        db.rpc("site_daily_stats", { _site: siteId, _days: 90 }),
        db.from("incidents").select("id,kind,severity,title,status,opened_at,resolved_at").eq("site_id", siteId).gte("opened_at", since).order("opened_at", { ascending: false }),
      ]);
      if (off) return;
      if (s.error) toast.error(s.error.message);
      setRows((s.data as DailyRow[]) ?? []);
      setIncidents((i.data as Incident[]) ?? []);
      const { data: site } = await db.from("monitored_sites").select("email_domain").eq("id", siteId).maybeSingle();
      if (site?.email_domain) {
        const { data: ev } = await db.from("email_events").select("type").eq("from_domain", site.email_domain).gte("created_at", since).limit(1000);
        const c: Record<string, number> = {};
        for (const e of (ev ?? []) as Array<{ type: string }>) c[e.type] = (c[e.type] ?? 0) + 1;
        if (!off) setEmailCounts(c);
      }
    })();
    return () => { off = true; };
  }, [siteId]);

  const today = brusselsToday();
  const s = useMemo(() => (rows ? summarise(rows, days, today) : null), [rows, days, today]);
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const inc = incidents.filter((i) => i.opened_at >= since);
  const mttr = mttrMinutes(inc);

  if (!s) return <div className="text-sm text-muted-foreground py-6 text-center">Laden…</div>;
  const chart = s.daily.map((d) => ({ ...d, label: d.day.slice(8, 10) + "/" + d.day.slice(5, 7) }));
  const uptimeColor = s.uptime == null ? undefined : s.uptime >= 99.5 ? "#1D9E75" : s.uptime >= 98 ? "#D97706" : "#DC2626";

  return (
    <>
      <div className="flex gap-1 mb-3">
        {PERIODS.map((p) => (
          <button key={p} onClick={() => setDays(p)}
            className={`px-3 py-1 rounded-full text-xs border ${days === p ? "bg-white text-black border-white" : "border-border text-muted-foreground"}`}>
            {p} dagen
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <Kpi label="Uptime website" value={s.uptime == null ? "—" : `${s.uptime}%`} color={uptimeColor} />
        <Kpi label="Gem. laadtijd" value={s.avgMs == null ? "—" : `${s.avgMs} ms`} />
        <Kpi label="Incidenten" value={String(inc.length)} color={inc.length ? "#D97706" : undefined} />
        <Kpi label="Gem. hersteltijd" value={mttr == null ? "—" : mttr < 60 ? `${mttr} min` : `${Math.round(mttr / 6) / 10} u`} />
      </div>

      {s.checks === 0 ? (
        <Card title="Nog geen gegevens"><p className="text-sm text-muted-foreground">Er zijn nog geen controles in deze periode. Zodra de automatische controle loopt, vult deze map zich vanzelf.</p></Card>
      ) : (
        <>
          <Card title="Uptime per dag (%)">
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={{ left: -20, right: 4, top: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" stroke="hsl(var(--muted-foreground))" />
                  <YAxis domain={[90, 100]} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" allowDataOverflow />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} formatter={(v: number) => [`${v}%`, "Uptime"]} />
                  <Bar dataKey="uptime" fill="#1D9E75" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card title="Gemiddelde laadtijd per dag (ms)">
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chart} margin={{ left: -10, right: 4, top: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} formatter={(v: number) => [`${v} ms`, "Laadtijd"]} />
                  <Line type="monotone" dataKey="avgMs" stroke="#C9A84C" strokeWidth={2} dot={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card title="Per controle">
            <div className="space-y-1.5">
              {s.byKind.map((k) => (
                <div key={k.kind} className="flex items-center justify-between text-sm">
                  <span>{KIND_LABEL[k.kind] ?? k.kind}</span>
                  <span className="text-muted-foreground tabular-nums">{k.ok}/{k.checks} OK · <span className={k.rate != null && k.rate < 99 ? "text-amber-400" : ""}>{k.rate ?? "—"}%</span></span>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      {Object.keys(emailCounts).length > 0 && (
        <Card title="E-mail (Resend, laatste 90 dagen)">
          <div className="flex flex-wrap gap-2 text-xs">
            {Object.entries(emailCounts).sort().map(([t, n]) => (
              <span key={t} className="rounded-full bg-muted/50 px-2.5 py-1">{t.replace("email.", "")}: <b>{n}</b></span>
            ))}
          </div>
        </Card>
      )}

      <Card title={`Incidenten (${inc.length})`}>
        {inc.length === 0 ? <p className="text-sm text-muted-foreground">Geen incidenten in deze periode.</p> : (
          <div className="space-y-2">
            {inc.slice(0, 15).map((i) => (
              <div key={i.id} className="flex items-start gap-2 text-sm">
                {i.status === "resolved" ? <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-400 shrink-0" /> : <XCircle className="w-4 h-4 mt-0.5 text-red-400 shrink-0" />}
                <div className="min-w-0">
                  <div className="truncate">{i.title}</div>
                  <div className="text-[11px] text-muted-foreground">{formatDate(i.opened_at)}{i.resolved_at ? ` · opgelost na ${Math.round((new Date(i.resolved_at).getTime() - new Date(i.opened_at).getTime()) / 60000)} min` : " · nog open"}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

// ---------- Bezoekers ----------
const HUB_ORIGIN = typeof window !== "undefined" ? window.location.origin.replace(/^https:\/\/id-preview--[^.]+/, "https://solyn22") : "https://solyn22.lovable.app";

function TrackingSnippet({ trackingId }: { trackingId?: string }) {
  if (!trackingId) return null;
  const code = `<script defer src="${HUB_ORIGIN}/t.js" data-site="${trackingId}"></script>`;
  return (
    <Card title="Bezoekersteller" icon={<Users className="w-3.5 h-3.5" />}>
      <p className="text-xs text-muted-foreground mb-2">Plaats deze regel in de &lt;head&gt; van de website. Geen cookies, geen persoonsgegevens bewaard.</p>
      <div className="flex gap-2 items-start">
        <code className="flex-1 text-[11px] bg-muted/50 rounded p-2 break-all">{code}</code>
        <Button size="icon" variant="outline" onClick={() => { navigator.clipboard.writeText(code); toast.success("Gekopieerd"); }}><Copy className="w-4 h-4" /></Button>
      </div>
    </Card>
  );
}

function Visitors({ siteId }: { siteId: string }) {
  const [days, setDays] = useState<VisitDay[] | null>(null);
  const [pages, setPages] = useState<Array<{ path: string; views: number }>>([]);
  const [sources, setSources] = useState<Array<{ source: string; views: number }>>([]);
  const [range, setRange] = useState<"week" | "month" | "all">("month");
  const today = brusselsToday();

  useEffect(() => {
    db.from("site_visits_daily").select("day,pageviews,visitors").eq("site_id", siteId).order("day")
      .then(({ data }: { data: VisitDay[] | null }) => setDays(data ?? []));
  }, [siteId]);

  useEffect(() => {
    const since = range === "week" ? shiftDay(today, -6) : range === "month" ? shiftDay(today, -29) : "0000-01-01";
    const sum = (rows: Array<{ views: number } & Record<string, unknown>>, key: string) => {
      const m = new Map<string, number>();
      for (const r of rows) m.set(String(r[key]), (m.get(String(r[key])) ?? 0) + Number(r.views));
      return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    };
    Promise.all([
      db.from("site_pages_daily").select("path,views").eq("site_id", siteId).gte("day", since).limit(5000),
      db.from("site_sources_daily").select("source,views").eq("site_id", siteId).gte("day", since).limit(5000),
    ]).then(([p, so]: Array<{ data: Array<{ views: number } & Record<string, unknown>> | null }>) => {
      setPages(sum(p.data ?? [], "path").map(([path, views]) => ({ path, views })));
      setSources(sum(so.data ?? [], "source").map(([source, views]) => ({ source, views })));
    });
  }, [siteId, range, today]);

  if (!days) return null;
  if (days.length === 0) return (
    <Card title="Bezoekers" icon={<Users className="w-3.5 h-3.5" />}>
      <p className="text-sm text-muted-foreground">Nog geen bezoekersdata. Plaats de bezoekersteller (zie Overzicht) op de website; vanaf dan telt de Hub elke dag de bezoekers.</p>
    </Card>
  );

  const t = visitTotals(days, today, shiftDay);
  const n = range === "week" ? 7 : range === "month" ? 30 : Math.max(30, Math.min(365, days.length));
  const chart = Array.from({ length: n }, (_, i) => {
    const d = shiftDay(today, -(n - 1 - i));
    const r = days.find((x) => x.day === d);
    return { label: d.slice(8, 10) + "/" + d.slice(5, 7), visitors: r?.visitors ?? 0, pageviews: r?.pageviews ?? 0 };
  });

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <Kpi label={`Vandaag · ${t.today.pageviews} weergaven`} value={`${t.today.visitors} bezoekers`} />
        <Kpi label={`7 dagen · ${t.week.pageviews} weergaven`} value={`${t.week.visitors}`} />
        <Kpi label={`30 dagen · ${t.month.pageviews} weergaven`} value={`${t.month.visitors}`} />
        <Kpi label={`Sinds ${formatDate(days[0].day)} · ${t.all.pageviews} weergaven`} value={`${t.all.visitors}`} />
      </div>
      <Card title="Bezoekers per dag" icon={<Users className="w-3.5 h-3.5" />}>
        <div className="flex gap-1 mb-2">
          {([["week", "7 dagen"], ["month", "30 dagen"], ["all", "Alles"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setRange(k)}
              className={`px-3 py-1 rounded-full text-xs border ${range === k ? "bg-white text-black border-white" : "border-border text-muted-foreground"}`}>{l}</button>
          ))}
        </div>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart} margin={{ left: -20, right: 4, top: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" stroke="hsl(var(--muted-foreground))" />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                formatter={(v: number, k: string) => [v, k === "visitors" ? "Bezoekers" : "Weergaven"]} />
              <Bar dataKey="visitors" fill="#C9A84C" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <div className="grid md:grid-cols-2 gap-3">
        <Card title="Populairste pagina's">
          {pages.length === 0 ? <p className="text-sm text-muted-foreground">—</p> : pages.map((p) => (
            <div key={p.path} className="flex justify-between gap-2 text-sm py-0.5"><span className="truncate">{p.path}</span><span className="tabular-nums text-muted-foreground">{p.views}</span></div>
          ))}
        </Card>
        <Card title="Bronnen">
          {sources.length === 0 ? <p className="text-sm text-muted-foreground">—</p> : sources.map((p) => (
            <div key={p.source} className="flex justify-between gap-2 text-sm py-0.5"><span className="truncate">{p.source}</span><span className="tabular-nums text-muted-foreground">{p.views}</span></div>
          ))}
        </Card>
      </div>
    </>
  );
}

// ---------- Pagina's ----------
function Pages({ siteId }: { siteId: string }) {
  const fn = useServerFn(getSitePages);
  const [res, setRes] = useState<{ sitemap: string | null; pages: string[]; truncated: boolean } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    fn({ data: { siteId } }).then(setRes).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [fn, siteId]);

  if (err) return <Card title="Pagina's"><p className="text-sm text-red-400">{err}</p></Card>;
  if (!res) return <div className="text-sm text-muted-foreground py-6 text-center">Sitemap lezen…</div>;
  if (!res.sitemap) return <Card title="Pagina's"><p className="text-sm text-muted-foreground">Geen sitemap gevonden op deze website. Voeg een sitemap.xml toe (ook goed voor SEO).</p></Card>;
  const list = res.pages.filter((p) => p.toLowerCase().includes(q.toLowerCase()));
  return (
    <Card title={`${res.pages.length}${res.truncated ? "+" : ""} pagina's in de sitemap`} icon={<FileText className="w-3.5 h-3.5" />}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zoek pagina…"
        className="w-full mb-3 h-9 rounded-md bg-background border border-input px-3 text-sm" />
      <div className="max-h-[50vh] overflow-y-auto space-y-1">
        {list.map((p) => {
          let path = p;
          try { path = new URL(p).pathname || "/"; } catch { /* keep full url */ }
          return (
            <a key={p} href={p} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-2 text-sm rounded px-2 py-1 hover:bg-muted/50">
              <span className="truncate">{path}</span><ExternalLink className="w-3 h-3 shrink-0 opacity-50" />
            </a>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground mt-2 break-all">Bron: {res.sitemap}</p>
    </Card>
  );
}

// ---------- Data ----------
function DataSources({ site }: { site: Site }) {
  return (
    <>
      <Card title="Gegevens van deze website" icon={<Database className="w-3.5 h-3.5" />}>
        <p className="text-sm text-muted-foreground">
          Boekingen, formulieren, klanten en andere gegevens staan in de eigen database van deze website
          ({DB_PROVIDERS[site.db_provider] ?? site.db_provider}). Om die hier te tonen moet de website ze veilig delen met de Hub.
          Dat is nog niet gekoppeld.
        </p>
      </Card>
      <Card title="Wat hier komt">
        <ul className="text-sm space-y-1.5 list-disc pl-5 text-muted-foreground">
          <li>Aantal aanvragen, boekingen en formulieren per dag/week</li>
          <li>Laatste inzendingen (alleen lezen)</li>
          <li>Aantal records per tabel en groei</li>
          <li>Export voor de klant of de boekhouding</li>
        </ul>
      </Card>
    </>
  );
}

// ---------- Financieel ----------
function Finance({ clientId, clientName }: { clientId: string | null; clientName: string | null }) {
  const [rows, setRows] = useState<Invoice[] | null>(null);
  const [costs, setCosts] = useState<number>(0);
  useEffect(() => {
    if (!clientId) { setRows([]); return; }
    Promise.all([
      supabase.from("invoices").select("id,invoice_number,date,total,status,line_items").eq("client", clientId).order("date", { ascending: false }),
      supabase.from("expenses").select("monthly_cost").eq("linked_client", clientId),
    ]).then(([i, e]) => {
      setRows((i.data as unknown as Invoice[]) ?? []);
      setCosts(((e.data ?? []) as Array<{ monthly_cost: number }>).reduce((s, r) => s + Number(r.monthly_cost || 0), 0));
    });
  }, [clientId]);

  if (!clientId) return <Card title="Financieel"><p className="text-sm text-muted-foreground">Koppel deze site aan een klant (Bewerken) om facturen en kosten te zien.</p></Card>;
  if (!rows) return <div className="text-sm text-muted-foreground py-6 text-center">Laden…</div>;
  const paid = rows.filter((r) => r.status === "Paid").reduce((s, r) => s + Number(r.total || 0), 0);
  const open = rows.filter((r) => r.status === "Sent").reduce((s, r) => s + Number(r.total || 0), 0);
  return (
    <>
      <div className="grid grid-cols-3 gap-2 mb-3">
        <Kpi label="Betaald" value={formatCurrency(paid)} color="#1D9E75" />
        <Kpi label="Openstaand" value={formatCurrency(open)} color={open ? "#D97706" : undefined} />
        <Kpi label="Kosten / maand" value={formatCurrency(costs)} />
      </div>
      <Card title={`Facturen ${clientName ?? ""}`}>
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">Nog geen facturen.</p> : (
          <div className="space-y-1.5">
            {rows.slice(0, 24).map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <span className="font-mono text-xs text-muted-foreground mr-2">{formatInvoiceNumber(r.invoice_number)}</span>
                  <span className="text-xs text-muted-foreground">{formatDate(r.date)}</span>
                  <div className="truncate text-xs">{r.line_items?.[0]?.description ?? ""}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="tabular-nums">{formatCurrency(Number(r.total))}</div>
                  <div className={`text-[10px] ${r.status === "Paid" ? "text-emerald-400" : r.status === "Sent" ? "text-amber-400" : "text-muted-foreground"}`}>{r.status}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        <Link to="/invoices" className="inline-block text-xs text-primary mt-3">Alle facturen →</Link>
      </Card>
    </>
  );
}
