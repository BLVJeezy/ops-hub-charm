import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  Activity, AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, Film, Globe, Heart, Inbox, Plus, TrendingUp, Users, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { HealthDot } from "@/components/HealthDot";
import { QuickAddProspect } from "@/components/QuickAddProspect";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { clientMRR, type FeeClient } from "@/lib/fees";
import { formatCurrency, todayISO } from "@/lib/format";
import { PIPELINE_STAGES, STAGE_COLORS } from "@/lib/constants";
import { useCurrency } from "@/components/CurrencyToggle";

export const Route = createFileRoute("/_authenticated/dashboard")({ component: Dashboard });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
type Site = { id: string; name: string; last_status: string; last_response_ms: number | null; is_critical: boolean };
type Incident = { id: string; site_id: string; severity: string; title: string; opened_at: string };
type Visit = { site_id: string; day: string; visitors: number };
type Rec = { id: string; site_id: string; kind: string; starts_at: string | null; status: string | null; title: string | null; customer_name: string | null; source_created_at: string | null };
type Client = FeeClient & { id: string; name: string; status: string | null; pipeline_stage: string | null; health: string | null; next_followup_date: string | null };
type Invoice = { id: string; total: number; status: string; date: string; client_name: string | null; invoice_number: number | null };
type Briefing = { day: string; status: "ok" | "warning" | "critical"; video_path: string | null };

const shift = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const KIND = { afspraak: "Afspraak", reservatie: "Reservatie", aanvraag: "Aanvraag", lead: "Lead", bestelling: "Bestelling", blokkade: "Blokkade" } as Record<string, string>;

function Dashboard() {
  useCurrency();
  const { user } = useAuth();
  const [sites, setSites] = useState<Site[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [records, setRecords] = useState<Rec[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [quickAdd, setQuickAdd] = useState(false);
  const [feed, setFeed] = useState<"agenda" | "nieuw" | "opvolgen">("agenda");
  const today = todayISO();

  useEffect(() => {
    const since = shift(today, -15);
    Promise.all([
      db.from("monitored_sites").select("id,name,last_status,last_response_ms,is_critical").eq("enabled", true).order("name"),
      db.from("incidents").select("id,site_id,severity,title,opened_at").eq("status", "open").order("opened_at", { ascending: false }),
      db.from("site_visits_daily").select("site_id,day,visitors").gte("day", since),
      db.from("site_records").select("id,site_id,kind,starts_at,status,title,customer_name,source_created_at").neq("kind", "blokkade").gte("starts_at", shift(today, -14)).order("starts_at").limit(1000),
      supabase.from("clients").select("*"),
      supabase.from("invoices").select("id,total,status,date,client_name,invoice_number"),
      db.from("daily_briefings").select("day,status,video_path").order("day", { ascending: false }).limit(1),
    ]).then(([s, i, v, r, c, inv, b]) => {
      setSites(s.data ?? []); setIncidents(i.data ?? []); setVisits(v.data ?? []); setRecords(r.data ?? []);
      setClients((c.data as unknown as Client[]) ?? []); setInvoices((inv.data as unknown as Invoice[]) ?? []);
      setBriefing(b.data?.[0] ?? null); setLoading(false);
    });
  }, [today]);

  const siteName = useMemo(() => Object.fromEntries(sites.map((s) => [s.id, s.name])), [sites]);
  const online = sites.filter((s) => s.last_status === "up").length;
  const down = sites.filter((s) => s.last_status === "down");
  const yday = shift(today, -1);
  const sumDay = (d: string) => visits.filter((v) => v.day === d).reduce((a, v) => a + (v.visitors || 0), 0);
  const visY = sumDay(yday), visY2 = sumDay(shift(today, -2));
  const chart = useMemo(() => Array.from({ length: 14 }, (_, i) => {
    const d = shift(today, i - 14);
    return { day: d.slice(8, 10) + "/" + d.slice(5, 7), Bezoekers: visits.filter((v) => v.day === d).reduce((a, v) => a + (v.visitors || 0), 0) };
  }), [visits, today]);
  const topSites = useMemo(() => {
    const m: Record<string, number> = {};
    visits.filter((v) => v.day > shift(today, -8) && v.day < today).forEach((v) => { m[v.site_id] = (m[v.site_id] || 0) + (v.visitors || 0); });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [visits, today]);
  const nowIso = new Date().toISOString();
  const fresh = records.filter((r) => (r.source_created_at ?? r.starts_at ?? "") > new Date(Date.now() - 86400e3).toISOString());
  const upcoming = records.filter((r) => (r.kind === "afspraak" || r.kind === "reservatie") && (r.starts_at ?? "") >= nowIso && !/cancel|geannuleerd/i.test(r.status ?? "")).slice(0, 6);
  const latest = [...records].filter((r) => r.kind === "lead" || r.kind === "aanvraag").sort((a, b) => (b.source_created_at ?? b.starts_at ?? "").localeCompare(a.source_created_at ?? a.starts_at ?? "")).slice(0, 5);

  const active = clients.filter((c) => c.status === "Active");
  const mrr = active.reduce((s, c) => s + clientMRR(c), 0);
  const open = invoices.filter((i) => i.status === "Sent");
  const openTotal = open.reduce((s, i) => s + Number(i.total || 0), 0);
  const monthPaid = invoices.filter((i) => i.status === "Paid" && i.date?.slice(0, 7) === today.slice(0, 7)).reduce((s, i) => s + Number(i.total || 0), 0);
  const followups = clients.filter((c) => c.next_followup_date && c.next_followup_date <= today).sort((a, b) => (a.next_followup_date ?? "").localeCompare(b.next_followup_date ?? "")).slice(0, 5);
  const pipeline = PIPELINE_STAGES.filter((s) => s !== "Converted").map((s) => ({ s, n: clients.filter((c) => c.status === "Prospect" && (c.pipeline_stage || "Found") === s).length }));
  const health = (["Green", "Orange", "Red"] as const).map((h) => ({ h, n: active.filter((c) => c.health === h).length }));

  if (loading) return <div className="p-6 text-muted-foreground">Dashboard laden…</div>;
  const hello = new Date().getHours() < 12 ? "Goedemorgen" : new Date().getHours() < 18 ? "Goedemiddag" : "Goedenavond";
  const bState = briefing?.status ?? (down.length ? "critical" : incidents.length ? "warning" : "ok");

  const tone = bState === "critical" ? "tone-red" : bState === "warning" ? "tone-amber" : "tone-emerald";
  const dot = (st: string) => (st === "up" ? "#1D9E75" : st === "down" ? "#DC2626" : st === "degraded" ? "#D97706" : "#6B7280");
  const feeds = { agenda: upcoming.length, nieuw: latest.length, opvolgen: followups.length };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-3 md:space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{new Date().toLocaleDateString("nl-BE", { weekday: "long", day: "numeric", month: "long" })}</div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight truncate">{hello}{user?.email ? `, ${user.email.split("@")[0]}` : ""}</h1>
        </div>
        <Button onClick={() => setQuickAdd(true)} title="Nieuwe prospect" className="gap-2 shrink-0 bg-white text-black hover:bg-white/90 rounded-full h-10 px-3 md:px-4"><Plus className="w-4 h-4" /><span className="hidden md:inline">Nieuwe prospect</span></Button>
      </div>

      {/* status strip */}
      <Link to="/briefing" className={`tone ${tone} block rounded-2xl border p-4 transition hover:brightness-110`}>
        <div className="flex items-center gap-3">
          {bState === "critical" ? <XCircle className="w-6 h-6 text-red-500 shrink-0" /> : bState === "warning" ? <AlertTriangle className="w-6 h-6 text-amber-500 shrink-0" /> : <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />}
          <div className="flex-1 min-w-0">
            <div className="font-semibold truncate">{bState === "critical" ? `Kritiek: ${down.map((s) => s.name).join(", ") || "site down"}` : bState === "warning" ? `${incidents.length} open incident${incidents.length === 1 ? "" : "en"}` : "Alle websites werken"}</div>
            <div className="text-xs text-muted-foreground truncate">{online}/{sites.length} online · {briefing ? `noon scan ${briefing.day.split("-").reverse().join("-")}` : "noon scan elke dag om 12:00"}</div>
          </div>
          <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0"><Film className="w-4 h-4" /><span className="hidden sm:inline">{briefing?.video_path ? "Bekijk video" : "Briefing"}</span><ArrowRight className="w-3.5 h-3.5" /></span>
        </div>
        {sites.length > 0 && (
          <div className="flex gap-1 mt-3" aria-hidden>
            {sites.map((x) => <span key={x.id} className="h-1.5 flex-1 rounded-full" style={{ backgroundColor: dot(x.last_status) }} />)}
          </div>
        )}
      </Link>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <Tile tone="tone-gold" ink="ink-gold" label="MRR" value={formatCurrency(mrr)} sub={`${formatCurrency(monthPaid)} betaald deze maand`} to="/finance" />
        <Tile tone={openTotal > 0 ? "tone-amber" : ""} label="Openstaande facturen" value={formatCurrency(openTotal)} sub={`${open.length} verstuurd`} to="/invoices" />
        <Tile tone="tone-sky" label="Bezoekers gisteren" value={String(visY)} sub={visY2 ? <Delta a={visY} b={visY2} /> : "alle sites"} to="/status" />
        <Tile tone={fresh.length ? "tone-violet" : ""} label="Nieuw in 24 uur" value={String(fresh.length)} sub="aanvragen, afspraken, leads" to="/status" />
      </div>

      <div className="grid lg:grid-cols-3 gap-3 md:gap-4">
        <Panel title="Websiteverkeer · 14 dagen" icon={<Activity className="w-4 h-4" />} className="lg:col-span-2" link={{ to: "/status", label: "Status" }}>
          <div className="h-28 md:h-48 -ml-2 md:ml-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chart}>
                <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#C9A14A" stopOpacity={0.5} /><stop offset="100%" stopColor="#C9A14A" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" interval={2} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={28} allowDecimals={false} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                <Area type="monotone" dataKey="Bezoekers" stroke="#C9A14A" fill="url(#g)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1">
            {topSites.slice(0, 6).map(([id, n]) => (
              <Link key={id} to="/status/$id" params={{ id }} className="flex justify-between text-xs hover:text-primary"><span className="truncate">{siteName[id] ?? "—"}</span><span className="tabular-nums text-muted-foreground">{n} · 7d</span></Link>
            ))}
          </div>
        </Panel>

        <Panel title="Websites" icon={<Globe className="w-4 h-4" />} link={{ to: "/status", label: "Alles" }} className="hidden lg:block">
          <div className="space-y-1.5">
            {sites.map((s) => (
              <Link key={s.id} to="/status/$id" params={{ id: s.id }} className="flex items-center gap-2 text-sm hover:text-primary">
                <span className={`w-2 h-2 rounded-full ${s.last_status === "up" ? "bg-emerald-500" : s.last_status === "down" ? "bg-red-500" : s.last_status === "degraded" ? "bg-amber-500" : "bg-muted-foreground"}`} />
                <span className="flex-1 truncate">{s.name}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{s.last_response_ms != null ? `${(s.last_response_ms / 1000).toFixed(1)}s` : "—"}</span>
              </Link>
            ))}
            {incidents.slice(0, 3).map((i) => <div key={i.id} className="text-xs text-red-500 truncate">⚠ {siteName[i.site_id]}: {i.title}</div>)}
          </div>
        </Panel>
      </div>

      {/* mobile: one card, three lists */}
      <div className="lg:hidden rounded-2xl border border-border bg-card p-4">
        <div className="inline-flex rounded-full bg-muted p-0.5 text-xs mb-2">
          {(["agenda", "nieuw", "opvolgen"] as const).map((k) => (
            <button key={k} onClick={() => setFeed(k)} className={`rounded-full px-3 min-h-8 transition ${feed === k ? "bg-white text-black" : "text-muted-foreground"}`}>
              {k === "agenda" ? "Agenda" : k === "nieuw" ? "Aanvragen" : "Opvolgen"}
              {feeds[k] > 0 && <span className="ml-1 opacity-60">{feeds[k]}</span>}
            </button>
          ))}
        </div>
        {feed === "agenda" && (upcoming.length ? upcoming.slice(0, 5).map((r) => <RecRow key={r.id} r={r} site={siteName[r.site_id]} />) : <Empty>Niets gepland de komende dagen.</Empty>)}
        {feed === "nieuw" && (latest.length ? latest.map((r) => <RecRow key={r.id} r={r} site={siteName[r.site_id]} created />) : <Empty>Nog geen aanvragen.</Empty>)}
        {feed === "opvolgen" && (followups.length ? followups.map((c) => (
          <Link key={c.id} to="/clients/$id" params={{ id: c.id }} className="flex justify-between text-sm py-1.5">
            <span className="truncate">{c.name}</span><span className={`text-xs ${c.next_followup_date! < today ? "text-red-500" : "text-muted-foreground"}`}>{c.next_followup_date!.split("-").reverse().slice(0, 2).join("/")}</span>
          </Link>
        )) : <Empty>Geen opvolgingen vandaag.</Empty>)}
      </div>

      <div className="hidden lg:grid lg:grid-cols-3 gap-4">
        <Panel title="Komende afspraken & reservaties" icon={<CalendarClock className="w-4 h-4" />}>
          {upcoming.length ? upcoming.map((r) => <RecRow key={r.id} r={r} site={siteName[r.site_id]} />) : <Empty>Niets gepland de komende dagen.</Empty>}
        </Panel>
        <Panel title="Laatste aanvragen & leads" icon={<Inbox className="w-4 h-4" />}>
          {latest.length ? latest.map((r) => <RecRow key={r.id} r={r} site={siteName[r.site_id]} created />) : <Empty>Nog geen aanvragen.</Empty>}
        </Panel>
        <Panel title="Opvolgen" icon={<Users className="w-4 h-4" />} link={{ to: "/clients", label: "Klanten" }}>
          {followups.length ? followups.map((c) => (
            <Link key={c.id} to="/clients/$id" params={{ id: c.id }} className="flex justify-between text-sm py-1 hover:text-primary">
              <span className="truncate">{c.name}</span><span className={`text-xs ${c.next_followup_date! < today ? "text-red-500" : "text-muted-foreground"}`}>{c.next_followup_date!.split("-").reverse().slice(0, 2).join("/")}</span>
            </Link>
          )) : <Empty>Geen opvolgingen vandaag.</Empty>}
        </Panel>
      </div>

      <div className="grid lg:grid-cols-3 gap-3 md:gap-4">
        <Panel title="Pipeline" icon={<TrendingUp className="w-4 h-4" />} className="lg:col-span-2" link={{ to: "/pipeline", label: "Pipeline" }}>
          <div className="lg:hidden">
            <div className="flex gap-1 h-9 items-end">
              {pipeline.filter((x) => x.s !== "Write-off").map(({ s, n }) => (
                <div key={s} className="flex-1 flex flex-col items-center gap-1" title={`${s}: ${n}`}>
                  <span className={`text-[11px] tabular-nums ${n ? "font-semibold" : "text-muted-foreground/50"}`}>{n}</span>
                  <span className="w-full rounded-full" style={{ height: n ? 6 + Math.min(n, 4) * 3 : 3, backgroundColor: n ? STAGE_COLORS[s] : "hsl(var(--muted))" }} />
                </div>
              ))}
            </div>
            <div className="flex justify-between text-[11px] text-muted-foreground mt-1.5"><span>Found</span><span>Negotiating</span></div>
          </div>
          <div className="hidden lg:grid grid-cols-3 sm:grid-cols-4 gap-2">
            {pipeline.map(({ s, n }) => (
              <Link key={s} to="/pipeline" className="rounded-xl bg-muted/40 p-2 hover:bg-muted"><div className="text-lg font-bold tabular-nums">{n}</div><div className="text-[11px] text-muted-foreground truncate">{s}</div></Link>
            ))}
          </div>
        </Panel>
        <Panel title="Klantgezondheid" icon={<Heart className="w-4 h-4" />}>
          <div className="grid grid-cols-3 gap-2">
            {health.map(({ h, n }) => <div key={h} className="flex flex-col items-start gap-1"><div className="flex items-center gap-2"><HealthDot health={h} /><span className="text-2xl font-bold tabular-nums">{n}</span></div><span className="text-xs text-muted-foreground">{h}</span></div>)}
          </div>
          <div className="text-xs text-muted-foreground mt-2">{active.length} actieve klanten</div>
        </Panel>
      </div>
      <QuickAddProspect open={quickAdd} onOpenChange={setQuickAdd} />
    </div>
  );
}

function Delta({ a, b }: { a: number; b: number }) {
  const p = Math.round(((a - b) / b) * 100);
  return <span className={p >= 0 ? "text-emerald-500" : "text-red-500"}>{p >= 0 ? "▲" : "▼"} {Math.abs(p)}% vs eergisteren</span>;
}
function Tile({ label, value, sub, to, tone = "", ink = "" }: { label: string; value: string; sub: ReactNode; to: string; tone?: string; ink?: string }) {
  return (
    <Link to={to} className={`rounded-2xl border bg-card px-3.5 py-3 md:p-4 hover:brightness-110 transition ${tone ? `tone ${tone}` : "border-border"}`}>
      <div className="text-xs text-muted-foreground truncate">{label}</div>
      <div className={`text-2xl font-bold mt-0.5 tabular-nums ${ink}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{sub}</div>
    </Link>
  );
}
function Panel({ title, icon, children, className = "", link }: { title: string; icon: ReactNode; children: ReactNode; className?: string; link?: { to: string; label: string } }) {
  return (
    <div className={`rounded-2xl border border-border bg-card p-4 ${className}`}>
      <div className="flex items-center justify-between mb-2 md:mb-3">
        <div className="flex items-center gap-2 text-sm font-medium">{icon}{title}</div>
        {link && <Link to={link.to} className="text-xs text-primary flex items-center gap-0.5">{link.label}<ArrowRight className="w-3 h-3" /></Link>}
      </div>
      {children}
    </div>
  );
}
function RecRow({ r, site, created }: { r: Rec; site?: string; created?: boolean }) {
  const t = created ? r.source_created_at ?? r.starts_at : r.starts_at;
  const d = t ? new Date(t) : null;
  return (
    <Link to="/status/$id" params={{ id: r.site_id }} className="flex items-center gap-2 py-1.5 text-sm hover:text-primary">
      <span className="text-xs text-muted-foreground w-16 shrink-0">{d ? d.toLocaleDateString("nl-BE", { day: "numeric", month: "short" }) : "—"}</span>
      <span className="flex-1 truncate">{r.customer_name || r.title || KIND[r.kind]}</span>
      <span className="text-[11px] text-muted-foreground truncate max-w-24">{site}</span>
    </Link>
  );
}
function Empty({ children }: { children: ReactNode }) { return <p className="text-sm text-muted-foreground">{children}</p>; }
