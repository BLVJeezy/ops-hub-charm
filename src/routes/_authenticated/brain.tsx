import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, BrainCircuit, Check, ChevronLeft, ChevronRight, GripVertical, LayoutGrid, Maximize2, Minus, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { BrainCanvas, type BrainNeuron } from "@/components/BrainCanvas";
import { PerkRing } from "@/components/PerkRing";
import type { BrainMode } from "@/lib/brain3d";

type View = BrainMode | "perks";
import { ForecastChart, ForecastLegend } from "@/components/ForecastChart";
import { clientMRR, serviceMRR, type FeeClient } from "@/lib/fees";
import { formatCurrency, formatDate } from "@/lib/format";
import { formatInvoiceNumber } from "@/lib/invoice-code";
import { brusselsToday, forecastByService, type ForecastInvoice } from "@/lib/invoice-schedule";

export const Route = createFileRoute("/_authenticated/brain")({
  component: BrainPage,
  head: () => ({ meta: [{ title: "Brain · Solyn" }] }),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

type ClientRow = FeeClient & { id: string; name: string; status: string; pipeline_stage?: string | null; social_videos_per_month?: number | null };
type SiteRow = { id: string; client_id: string | null; name: string; last_status: string | null };
type InvoiceRow = ForecastInvoice & { id: string; client: string | null; client_name: string | null; invoice_number: number; date: string; sent_at: string | null; updated_at: string };
type RecordRow = { id: string; site_id: string; kind: string; title: string | null; customer_name: string | null; source_created_at: string | null };
type Task = { id: string; client_id: string | null; title: string; assignee: "me" | "client"; due_date: string | null; done_at: string | null; created_at: string };
type Video = { id: string; client_id: string; month: string; slot: number; status: "verstuurd" | "geplaatst"; sent_at: string | null; posted_at: string | null };
type Data = { clients: ClientRow[]; sites: SiteRow[]; invoices: InvoiceRow[]; records: RecordRow[]; tasks: Task[]; videos: Video[] };

const MODES: [View, string][] = [["orbit", "Stelsel"], ["perks", "Perks"], ["brain", "Brein"], ["globe", "Bol"]];
const planetUrl = (name: string) => supabase.storage.from("planets").getPublicUrl(`${name}.png`).data.publicUrl;
const FALLBACK = ["#38bdf8", "#f472b6", "#34d399", "#c084fc", "#fbbf24", "#fb7185", "#2dd4bf"];
const card = "rounded-2xl border border-sky-300/10 bg-[rgba(10,14,30,0.72)] backdrop-blur-xl p-4";
const isPlanned = (v: InvoiceRow) => (v.status === "Draft" && !!v.scheduled_send_at) || (!!v.repeat_monthly && !!v.next_repeat_on);
const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${Math.max(1, m)} min`;
  if (m < 60 * 24) return `${Math.round(m / 60)} u`;
  return `${Math.round(m / 1440)} d`;
};

function BrainPage() {
  const [data, setData] = useState<Data | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<View>(() => {
    try { const v = localStorage.getItem("brain-mode"); return v === "globe" || v === "brain" || v === "perks" ? v : "orbit"; } catch { return "orbit"; }
  });
  const [layout, setLayout] = useState<WidgetState[]>(readLayout);
  const [editing, setEditing] = useState(false);
  const [dragId, setDragId] = useState<WidgetId | null>(null);
  const saveLayout = (next: WidgetState[]) => { setLayout(next); try { localStorage.setItem("brain-layout-v1", JSON.stringify(next)); } catch { /* storage unavailable */ } };
  const patch = (id: WidgetId, change: Partial<WidgetState>) => saveLayout(layout.map((w) => (w.id === id ? { ...w, ...change } : w)));
  const swap = (a: WidgetId, b: WidgetId) => { const next = [...layout]; const i = next.findIndex((w) => w.id === a), j = next.findIndex((w) => w.id === b); if (i < 0 || j < 0) return; next.splice(j, 0, next.splice(i, 1)[0]); saveLayout(next); };
  const move = (id: WidgetId, d: -1 | 1) => { const vis = layout.filter((w) => !w.hidden); const i = vis.findIndex((w) => w.id === id), o = vis[i + d]; if (o) swap(id, o.id); };
  const resize = (id: WidgetId, d: -1 | 1) => { const w = layout.find((x) => x.id === id)!; const s = SPANS[Math.max(0, Math.min(SPANS.length - 1, SPANS.indexOf(w.span) + d))]; patch(id, { span: s }); };
  const pickMode = (k: View) => { setMode(k); try { localStorage.setItem("brain-mode", k); } catch { /* storage unavailable */ } };
  const today = brusselsToday();
  const month = today.slice(0, 7) + "-01";

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 30 * 864e5).toISOString();
    const [c, s, i, r, t, v] = await Promise.all([
      supabase.from("clients").select("*"),
      db.from("monitored_sites").select("id,client_id,name,last_status").eq("enabled", true),
      db.from("invoices").select("id,client,client_name,invoice_number,total,status,date,sent_at,updated_at,line_items,scheduled_send_at,repeat_monthly,repeat_day,next_repeat_on"),
      db.from("site_records").select("id,site_id,kind,title,customer_name,source_created_at").neq("kind", "blokkade").gte("source_created_at", since).order("source_created_at", { ascending: false }).limit(60),
      db.from("client_tasks").select("*").order("created_at", { ascending: false }).limit(300),
      db.from("client_videos").select("*").gte("month", new Date(Date.now() - 62 * 864e5).toISOString().slice(0, 10)),
    ]);
    setData({ clients: (c.data as unknown as ClientRow[]) ?? [], sites: s.data ?? [], invoices: i.data ?? [], records: r.data ?? [], tasks: t.data ?? [], videos: v.data ?? [] });
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const m = useMemo(() => {
    if (!data) return null;
    const customers = data.clients.filter((c) => !c.is_internal);
    const active = customers.filter((c) => c.status === "Active").sort((a, b) => clientMRR(b) - clientMRR(a) || a.name.localeCompare(b.name));
    const prospects = customers.filter((c) => c.status === "Prospect").sort((a, b) => a.name.localeCompare(b.name));
    const top = Math.max(1, ...active.map(clientMRR));
    const colorOf: Record<string, string> = {};
    [...active, ...prospects].forEach((c, i) => { colorOf[c.id] = c.brand_color || FALLBACK[i % FALLBACK.length]; });
    const nameOf: Record<string, string> = Object.fromEntries(data.clients.map((c) => [c.id, c.name]));
    const openTasks = data.tasks.filter((t) => !t.done_at);
    const neurons: BrainNeuron[] = [...active, ...prospects].map((c) => {
      const mrr = clientMRR(c), prospect = c.status === "Prospect";
      return {
        key: c.id, label: c.name.replace(/\s*\(.*\)$/, ""), color: colorOf[c.id], weight: prospect ? 0 : mrr / top, dim: prospect,
        value: prospect ? (c.pipeline_stage ?? "prospect") : mrr ? `${formatCurrency(mrr)}/mnd` : "klant",
        alert: data.sites.some((s) => s.client_id === c.id && s.last_status === "down"),
        badge: openTasks.filter((t) => t.client_id === c.id).length || undefined,
      };
    });
    return { active, prospects, colorOf, nameOf, neurons, mrr: active.reduce((a, c) => a + clientMRR(c), 0) };
  }, [data]);

  if (!data || !m) return <div className="min-h-[60vh] grid place-items-center text-sm text-white/50" style={{ background: "#02030a" }}>Het brein wordt opgebouwd…</div>;

  const sel = selected ? data.clients.find((c) => c.id === selected) ?? null : null;
  const mine = <T extends { client_id?: string | null; client?: string | null }>(rows: T[]) => (sel ? rows.filter((r) => (r.client_id ?? r.client) === sel.id) : rows);
  const invoices = mine(data.invoices);
  const tasks = mine(data.tasks);
  const siteClient: Record<string, string | null> = Object.fromEntries(data.sites.map((s) => [s.id, s.client_id]));
  const siteName: Record<string, string> = Object.fromEntries(data.sites.map((s) => [s.id, s.name]));
  const records = sel ? data.records.filter((r) => siteClient[r.site_id] === sel.id) : data.records;
  const videoClients = (sel ? [sel] : m.active).filter((c) => Number(c.social_videos_per_month) > 0);
  const up = data.sites.filter((s) => s.last_status !== "down").length;
  const openTotal = invoices.filter((v) => v.status === "Sent").reduce((a, v) => a + Number(v.total || 0), 0);
  const paidMonth = invoices.filter((v) => v.status === "Paid" && v.date.slice(0, 7) === today.slice(0, 7)).reduce((a, v) => a + Number(v.total || 0), 0);
  const forecast = forecastByService(invoices, today, 6);
  const forecastTotal = forecast.reduce((a, r) => a + r.total, 0);
  const upcoming = invoices.filter(isPlanned).map((v) => ({ v, at: (v.status === "Draft" ? v.scheduled_send_at : v.next_repeat_on) as string })).filter((x) => !!x.at).sort((a, b) => a.at.localeCompare(b.at));
  const services = serviceMRR(sel ? [sel] : m.active);
  const planetUrls: Record<string, string> = Object.fromEntries([...m.neurons.map((n) => [n.key, planetUrl(n.dim ? "prospect" : n.key)] as const), ["core", planetUrl("sun")]]);
  const openTasks = tasks.filter((t) => !t.done_at).sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));

  // what happened lately, newest first
  const events: { at: string; text: string; color: string }[] = [];
  for (const v of invoices) {
    if (v.sent_at) events.push({ at: v.sent_at, text: `Factuur ${formatInvoiceNumber(v.invoice_number)} verstuurd naar ${v.client_name ?? "klant"}`, color: "#38bdf8" });
    if (v.status === "Paid") events.push({ at: v.updated_at ?? v.date, text: `Betaling ontvangen van ${v.client_name ?? "klant"} · ${formatCurrency(Number(v.total))}`, color: "#34d399" });
  }
  for (const r of records) if (r.source_created_at) events.push({ at: r.source_created_at, text: `Nieuwe ${r.kind} via ${siteName[r.site_id] ?? "website"}: ${r.customer_name || r.title || ""}`, color: "#f472b6" });
  for (const v of mine(data.videos)) {
    if (v.sent_at) events.push({ at: v.sent_at, text: `Video ${v.slot} verstuurd naar ${m.nameOf[v.client_id] ?? "klant"}`, color: "#a78bfa" });
    if (v.posted_at) events.push({ at: v.posted_at, text: `Video ${v.slot} geplaatst voor ${m.nameOf[v.client_id] ?? "klant"}`, color: "#34d399" });
  }
  for (const t of tasks) if (t.done_at) events.push({ at: t.done_at, text: `Taak afgerond: ${t.title}`, color: "#9ca3af" });
  events.sort((a, b) => String(b.at).localeCompare(String(a.at)));

  return (
    <div className="min-h-screen -mb-28 lg:mb-0 pb-28 lg:pb-6" style={{ background: "radial-gradient(70% 50% at 50% 30%, rgba(40,70,255,0.14), transparent 70%), #02030a" }}>
      <div className="p-3 md:p-5 space-y-3">
        {/* where am I + the numbers that matter */}
        <header className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-2">
            <BrainCircuit className="w-5 h-5 text-sky-300" />
            <h1 className="text-xl font-semibold tracking-tight">Brain</h1>
            <span className="inline-flex items-center gap-1 text-[11px] text-sky-300"><span className="w-1.5 h-1.5 rounded-full bg-sky-300" />live</span>
          </div>
          <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
            <Stat label="Per maand" value={formatCurrency(sel ? clientMRR(sel) : m.mrr)} />
            {!sel && <Stat label="Klanten" value={`${m.active.length} + ${m.prospects.length} prospects`} />}
            <Stat label="Open taken" value={String(openTasks.length)} />
            <Stat label="Openstaand" value={formatCurrency(openTotal)} warn={openTotal > 0} />
            {!sel && <Stat label="Sites online" value={`${up}/${data.sites.length}`} warn={up < data.sites.length} />}
          </dl>
          <button onClick={() => setEditing(!editing)} aria-pressed={editing} className={`press ml-auto h-9 px-3 rounded-full inline-flex items-center gap-1.5 text-sm border transition-colors ${editing ? "bg-white text-black border-white font-semibold" : "border-white/15 text-white/75 hover:text-white"}`}>
            <LayoutGrid className="w-4 h-4" />{editing ? "Klaar" : "Indelen"}
          </button>
          {sel && (
            <div className="flex items-center gap-2 pop-in">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 pl-3 pr-1 h-9 text-sm font-medium">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: m.colorOf[sel.id] }} />{sel.name}
                <button onClick={() => setSelected(null)} aria-label="Toon alle klanten" className="press w-7 h-7 rounded-full grid place-items-center hover:bg-white/10"><X className="w-3.5 h-3.5" /></button>
              </span>
              <Link to="/clients/$id" params={{ id: sel.id }} className="press h-9 px-4 rounded-full bg-white text-black text-sm font-semibold inline-flex items-center gap-1.5">Open klant <ArrowRight className="w-4 h-4" /></Link>
            </div>
          )}
        </header>

        {/* widgets: move, resize, remove and add them in "Indelen" */}
        {editing && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-sky-300/20 bg-sky-400/5 px-3 py-2 text-xs pop-in">
            <span className="text-white/60">Sleep een widget om hem te verplaatsen. Toevoegen:</span>
            {layout.filter((w) => w.hidden).map((w) => (
              <button key={w.id} onClick={() => patch(w.id, { hidden: false })} className="press inline-flex items-center gap-1 rounded-full bg-white/10 hover:bg-white/15 h-8 px-3"><Plus className="w-3.5 h-3.5" />{WIDGETS[w.id].title}</button>
            ))}
            {!layout.some((w) => w.hidden) && <span className="text-white/40">alles staat erop</span>}
            <button onClick={() => saveLayout(DEFAULT_LAYOUT)} className="press ml-auto rounded-full h-8 px-3 text-white/70 hover:bg-white/10">Standaard</button>
          </div>
        )}
        <div className="grid gap-3 grid-cols-[minmax(0,1fr)] lg:grid-cols-12 lg:gap-y-0 lg:[grid-auto-rows:4px] lg:[grid-auto-flow:dense] lg:items-start">
          {layout.filter((w) => !w.hidden).map((w) => (
            <WidgetFrame key={w.id} w={w} editing={editing} tall={w.id === "brain"}
              onMove={(d) => move(w.id, d)} onSize={(d) => resize(w.id, d)} onRemove={() => patch(w.id, { hidden: true })}
              onDragStart={() => setDragId(w.id)} onDragOver={() => { if (dragId && dragId !== w.id) swap(dragId, w.id); }} onDragEnd={() => setDragId(null)} dragging={dragId === w.id}>
              {w.id === "brain" && (
                <div className="space-y-3">
                  <div className="relative h-[52vh] min-h-[340px] lg:h-[min(74vh,900px)] rounded-3xl overflow-hidden border border-sky-300/10" style={{ background: "radial-gradient(60% 60% at 50% 50%, rgba(30,50,160,0.22), rgba(2,3,10,0.6))" }}>
                    {mode === "perks"
                      ? <PerkRing neurons={m.neurons} coreLabel="Solyn" coreValue={`${formatCurrency(m.mrr)}/mnd`} selected={selected} onSelect={setSelected} />
                      : <BrainCanvas mode={mode} neurons={m.neurons} coreLabel="Solyn" coreValue={`${formatCurrency(m.mrr)}/mnd`} selected={selected} onSelect={setSelected} images={planetUrls} />}
                    <div className="pointer-events-none absolute left-4 top-3.5 text-[11px] text-white/40 max-sm:hidden">{mode === "perks" ? "Tik op een klant" : "Sleep om te draaien · tik op een klant"}</div>
              {/* switch the look; the data stays the same */}
              <div className="absolute right-3 top-3 inline-flex rounded-full border border-white/10 bg-[rgba(10,14,30,0.7)] backdrop-blur-xl p-0.5 text-xs" role="group" aria-label="Weergave">
                {MODES.map(([k, label]) => (
                  <button key={k} type="button" onClick={() => pickMode(k)} aria-pressed={mode === k} className={`press px-3 h-8 rounded-full transition-colors ${mode === k ? "bg-white text-black font-semibold" : "text-white/65 hover:text-white"}`}>{label}</button>
                ))}
              </div>
                  </div>
            {/* every client one tap away */}
                  <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" role="group" aria-label="Kies een klant">
                    {m.neurons.map((n) => (
                      <button key={n.key} onClick={() => setSelected(selected === n.key ? null : n.key)} aria-pressed={selected === n.key}
                        className={`press shrink-0 inline-flex items-center gap-2 rounded-full h-9 px-3 text-xs border transition-colors ${selected === n.key ? "bg-white text-black border-white font-semibold" : "border-white/10 bg-white/5 text-white/80"} ${n.dim ? "opacity-70" : ""}`}>
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: n.color, boxShadow: `0 0 8px ${n.color}` }} />{n.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {w.id === "tasks" && <Tasks tasks={tasks} open={openTasks} clients={[...m.active, ...m.prospects]} colorOf={m.colorOf} nameOf={m.nameOf} selected={sel?.id ?? null} today={today} onChange={load} />}
              {w.id === "videos" && <Videos clients={videoClients} videos={data.videos.filter((v) => v.month === month)} month={month} colorOf={m.colorOf} onChange={load} />}
              {w.id === "payments" && (
            <section className={card}>
              <h2 className="text-sm font-medium mb-2">Betalingen</h2>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <Tile label="Ontvangen · maand" value={formatCurrency(paidMonth)} className="text-emerald-400" />
                <Tile label="Openstaand" value={formatCurrency(openTotal)} className={openTotal ? "text-amber-400" : ""} />
                <Tile label="Gepland" value={String(upcoming.length)} className="text-sky-400" />
              </div>
              <ul className="divide-y divide-white/5 text-sm">
                {invoices.filter((v) => v.status === "Sent").map((v) => (
                  <li key={v.id} className="py-1.5 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" /><span className="flex-1 truncate">{v.client_name}</span><span className="text-[11px] text-amber-400">wacht op betaling</span><span className="tabular-nums font-medium">{formatCurrency(Number(v.total))}</span></li>
                ))}
                {upcoming.slice(0, 6).map(({ v, at }) => (
                  <li key={v.id} className="py-1.5 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: (v.client && m.colorOf[v.client]) || "#38bdf8" }} /><span className="flex-1 truncate">{v.client_name}</span><span className="text-[11px] text-white/45 tabular-nums">{formatDate(at)}{v.repeat_monthly ? " · mnd" : ""}</span><span className="tabular-nums font-medium">{formatCurrency(Number(v.total))}</span></li>
                ))}
                {!upcoming.length && !openTotal && <li className="py-2 text-white/45 text-xs">Geen geplande of openstaande facturen.</li>}
              </ul>
            </section>
              )}
              {w.id === "forecast" && (
            <section className={card}>
              <div className="flex items-baseline justify-between mb-2">
                <h2 className="text-sm font-medium">Projectie · 6 maanden</h2>
                <span className="text-sm font-semibold tabular-nums">{formatCurrency(forecastTotal)}</span>
              </div>
              <ForecastChart rows={forecast} height={170} />
              <div className="mt-2"><ForecastLegend /></div>
            </section>
              )}
              {w.id === "activity" && (
            <section className={card}>
              <h2 className="text-sm font-medium mb-2">Wat er gebeurd is</h2>
              <ul className="space-y-2">
                {events.slice(0, 10).map((e, i) => (
                  <li key={i} className="flex gap-2.5 text-sm"><span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: e.color }} /><span className="flex-1 min-w-0 text-white/80 leading-snug">{e.text}</span><span className="shrink-0 text-[11px] text-white/40 tabular-nums">{ago(e.at)}</span></li>
                ))}
                {!events.length && <li className="text-xs text-white/45">Nog niets gebeurd in de laatste 30 dagen.</li>}
              </ul>
            </section>
              )}
              {w.id === "clients" && (
                <section className={card}>
                  <h2 className="text-sm font-medium mb-2">Klanten</h2>
                  <ul className="divide-y divide-white/5 text-sm">
                    {m.neurons.map((n) => (
                      <li key={n.key}>
                        <button onClick={() => setSelected(selected === n.key ? null : n.key)} className={`press w-full flex items-center gap-2.5 py-2 text-left ${n.dim ? "opacity-60" : ""}`}>
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: n.color }} />
                          <span className={`flex-1 truncate ${selected === n.key ? "font-semibold" : ""}`}>{n.label}</span>
                          <span className="text-xs text-white/55 tabular-nums">{n.value}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {w.id === "sites" && (
                <section className={card}>
                  <div className="flex items-baseline justify-between mb-2"><h2 className="text-sm font-medium">Websites</h2><Link to="/status" className="text-[11px] text-white/50 hover:text-white">Status →</Link></div>
                  <ul className="divide-y divide-white/5 text-sm">
                    {(sel ? data.sites.filter((s) => s.client_id === sel.id) : data.sites).map((s) => (
                      <li key={s.id} className="py-1.5 flex items-center gap-2.5">
                        <span className={`w-2 h-2 rounded-full ${s.last_status === "up" ? "bg-emerald-400" : s.last_status === "down" ? "bg-red-400" : s.last_status === "degraded" ? "bg-amber-400" : "bg-white/30"}`} />
                        <span className="flex-1 truncate">{s.name}</span>
                        <span className="text-[11px] text-white/50">{s.last_status === "up" ? "online" : s.last_status === "down" ? "offline" : s.last_status === "degraded" ? "traag" : "onbekend"}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {w.id === "services" && (
                <section className={card}>
                  <h2 className="text-sm font-medium mb-2">Per dienst · per maand</h2>
                  <div className="grid grid-cols-3 gap-2">
                    {([["seo", "SEO", "#38bdf8"], ["website", "Websites", "#d6b25e"], ["social", "Social media", "#a78bfa"]] as const).map(([k, label, color]) => (
                      <div key={k} className="rounded-xl bg-white/5 px-2.5 py-2">
                        <div className="flex items-center gap-1.5 text-[10px] text-white/50"><span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />{label}</div>
                        <div className="text-sm font-semibold tabular-nums">{formatCurrency(services[k].mrr)}</div>
                        <div className="text-[10px] text-white/40 tabular-nums">{services[k].clients} {services[k].clients === 1 ? "klant" : "klanten"}</div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </WidgetFrame>
          ))}
        </div>
      </div>
    </div>
  );
}

type WidgetId = "brain" | "tasks" | "videos" | "payments" | "forecast" | "activity" | "clients" | "sites" | "services";
type WidgetState = { id: WidgetId; span: number; hidden?: boolean };
const WIDGETS: Record<WidgetId, { title: string }> = {
  brain: { title: "Stelsel" }, tasks: { title: "Taken" }, videos: { title: "Video's" }, payments: { title: "Betalingen" }, forecast: { title: "Projectie" },
  activity: { title: "Wat er gebeurd is" }, clients: { title: "Klanten" }, sites: { title: "Websites" }, services: { title: "Per dienst" },
};
const SPANS = [3, 4, 6, 8, 9, 12];
const DEFAULT_LAYOUT: WidgetState[] = [
  { id: "brain", span: 8 }, { id: "tasks", span: 4 }, { id: "payments", span: 4 }, { id: "videos", span: 4 }, { id: "forecast", span: 4 }, { id: "activity", span: 4 },
  { id: "clients", span: 4, hidden: true }, { id: "sites", span: 4, hidden: true }, { id: "services", span: 4, hidden: true },
];
function readLayout(): WidgetState[] {
  try {
    const saved = JSON.parse(localStorage.getItem("brain-layout-v1") ?? "null") as WidgetState[] | null;
    if (!Array.isArray(saved)) return DEFAULT_LAYOUT;
    const known = saved.filter((w) => w && w.id in WIDGETS && SPANS.includes(w.span));
    // widgets added in a later version join at the end, hidden
    return [...known, ...DEFAULT_LAYOUT.filter((d) => !known.some((k) => k.id === d.id)).map((d) => ({ ...d, hidden: true }))];
  } catch { return DEFAULT_LAYOUT; }
}

function WidgetFrame({ w, editing, tall, dragging, children, onMove, onSize, onRemove, onDragStart, onDragOver, onDragEnd }: {
  w: WidgetState; editing: boolean; tall?: boolean; dragging: boolean; children: React.ReactNode;
  onMove: (d: -1 | 1) => void; onSize: (d: -1 | 1) => void; onRemove: () => void; onDragStart: () => void; onDragOver: () => void; onDragEnd: () => void;
}) {
  const btn = "press hit w-7 h-7 rounded-full grid place-items-center hover:bg-white/15";
  // masonry: every widget takes exactly the rows its own height needs, so nothing leaves a hole beside the big one
  const inner = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState(1);
  useEffect(() => {
    const el = inner.current;
    if (!el) return;
    const measure = () => setRows(Math.ceil((el.offsetHeight + 12) / 4));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  void tall;
  return (
    <div
      className={`relative min-w-0 lg:[grid-column:span_var(--span)] lg:[grid-row-end:span_var(--rows)] ${editing ? "rounded-3xl ring-1 ring-sky-300/40 ring-offset-4 ring-offset-[#02030a]" : ""} ${dragging ? "opacity-50" : ""} transition-opacity`}
      style={{ "--span": w.span, "--rows": rows } as React.CSSProperties}
      onDragOver={editing ? (e) => { e.preventDefault(); onDragOver(); } : undefined}
    >
      {editing && (
        <div draggable onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", w.id); onDragStart(); }} onDragEnd={onDragEnd}
          className="absolute z-20 -top-2.5 left-1/2 -translate-x-1/2 flex items-center gap-0.5 rounded-full border border-white/15 bg-[rgba(14,18,36,0.95)] px-1.5 h-9 text-white/85 shadow-lg cursor-grab active:cursor-grabbing">
          <GripVertical className="w-4 h-4 text-white/50" aria-hidden />
          <span className="px-1 text-[11px] font-medium whitespace-nowrap">{WIDGETS[w.id].title}</span>
          <button className={btn} onClick={() => onMove(-1)} aria-label="Naar voren"><ChevronLeft className="w-4 h-4" /></button>
          <button className={btn} onClick={() => onMove(1)} aria-label="Naar achteren"><ChevronRight className="w-4 h-4" /></button>
          <button className={`${btn} max-lg:hidden`} onClick={() => onSize(-1)} aria-label="Smaller"><Minus className="w-3.5 h-3.5" /></button>
          <button className={`${btn} max-lg:hidden`} onClick={() => onSize(1)} aria-label="Breder"><Maximize2 className="w-3.5 h-3.5" /></button>
          <button className={`${btn} hover:text-red-400`} onClick={onRemove} aria-label="Widget weghalen"><X className="w-4 h-4" /></button>
        </div>
      )}
      <div ref={inner}>{children}</div>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return <div><dt className="text-[11px] text-white/45">{label}</dt><dd className={`font-semibold tabular-nums ${warn ? "text-amber-400" : "text-white"}`}>{value}</dd></div>;
}
function Tile({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return <div className="rounded-xl bg-white/5 px-2.5 py-2"><div className="text-[10px] text-white/45 truncate">{label}</div><div className={`text-sm font-semibold tabular-nums ${className}`}>{value}</div></div>;
}

function Tasks({ tasks, open, clients, colorOf, nameOf, selected, today, onChange }: {
  tasks: Task[]; open: Task[]; clients: ClientRow[]; colorOf: Record<string, string>; nameOf: Record<string, string>; selected: string | null; today: string; onChange: () => void;
}) {
  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState("");
  const [assignee, setAssignee] = useState<"me" | "client">("me");
  const [due, setDue] = useState("");
  useEffect(() => { setClientId(selected ?? ""); }, [selected]);
  const doneWeek = tasks.filter((t) => t.done_at && Date.now() - new Date(t.done_at).getTime() < 7 * 864e5).length;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const { data: u } = await supabase.auth.getUser();
    const { error } = await db.from("client_tasks").insert({ title: title.trim(), client_id: clientId || null, assignee, due_date: due || null, created_by: u.user?.id });
    if (error) return toast.error(error.message);
    setTitle(""); setDue(""); onChange();
  }
  async function toggle(t: Task) {
    const { error } = await db.from("client_tasks").update({ done_at: t.done_at ? null : new Date().toISOString() }).eq("id", t.id);
    if (error) toast.error(error.message); else onChange();
  }
  async function remove(t: Task) {
    const { error } = await db.from("client_tasks").delete().eq("id", t.id);
    if (error) toast.error(error.message); else onChange();
  }

  return (
    <section className={card}>
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-sm font-medium">Taken</h2>
        <span className="text-[11px] text-white/45 tabular-nums">{open.length} open · {doneWeek} afgerond deze week</span>
      </div>
      <form onSubmit={add} className="space-y-1.5 mb-3">
        <div className="flex gap-1.5">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nieuwe taak…" aria-label="Nieuwe taak" className="flex-1 min-w-0 h-9 rounded-lg bg-white/5 border border-white/10 px-3 text-sm outline-none focus:border-sky-300/50" />
          <button type="submit" aria-label="Taak toevoegen" className="press hit shrink-0 w-9 h-9 rounded-lg bg-white text-black grid place-items-center disabled:opacity-40" disabled={!title.trim()}><Plus className="w-4 h-4" /></button>
        </div>
        <div className="flex gap-1.5 text-xs">
          <select value={clientId} onChange={(e) => setClientId(e.target.value)} aria-label="Klant" className="flex-1 min-w-0 h-8 rounded-lg bg-white/5 border border-white/10 px-2 outline-none">
            <option value="">Algemeen</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="inline-flex rounded-lg border border-white/10 p-0.5" role="group" aria-label="Wie doet dit">
            {(["me", "client"] as const).map((a) => (
              <button key={a} type="button" onClick={() => setAssignee(a)} aria-pressed={assignee === a} className={`px-2.5 rounded-md ${assignee === a ? "bg-white text-black font-medium" : "text-white/60"}`}>{a === "me" ? "Ik" : "Klant"}</button>
            ))}
          </div>
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Deadline" className="h-8 w-[7.5rem] rounded-lg bg-white/5 border border-white/10 px-2 outline-none [color-scheme:dark]" />
        </div>
      </form>
      <ul className="space-y-1">
        {open.slice(0, 12).map((t) => (
          <li key={t.id} className="group flex items-start gap-2.5 rounded-lg px-1 py-1.5 hover:bg-white/5">
            <button onClick={() => toggle(t)} aria-label={`Rond af: ${t.title}`} className="press hit mt-0.5 shrink-0 w-5 h-5 rounded-full border border-white/30 grid place-items-center hover:border-emerald-400 hover:text-emerald-400 text-transparent"><Check className="w-3 h-3" /></button>
            <div className="flex-1 min-w-0">
              <div className="text-sm leading-snug">{t.title}</div>
              <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-white/45">
                {t.client_id && <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: colorOf[t.client_id] ?? "#888" }} />{nameOf[t.client_id]}</span>}
                {t.assignee === "client" && <span className="text-violet-300">wacht op klant</span>}
                {t.due_date && <span className={`tabular-nums ${t.due_date < today ? "text-red-400" : ""}`}>{t.due_date < today ? "te laat · " : ""}{formatDate(t.due_date)}</span>}
              </div>
            </div>
            <button onClick={() => remove(t)} aria-label={`Verwijder: ${t.title}`} className="press shrink-0 w-7 h-7 rounded-full grid place-items-center text-white/30 hover:text-red-400 lg:opacity-0 lg:group-hover:opacity-100 focus:opacity-100"><Trash2 className="w-3.5 h-3.5" /></button>
          </li>
        ))}
        {!open.length && <li className="text-xs text-white/45 py-1">Geen open taken. Voeg er een toe hierboven.</li>}
        {open.length > 12 && <li className="text-[11px] text-white/45 pt-1">+ {open.length - 12} meer</li>}
      </ul>
    </section>
  );
}

function Videos({ clients, videos, month, colorOf, onChange }: { clients: ClientRow[]; videos: Video[]; month: string; colorOf: Record<string, string>; onChange: () => void }) {
  async function cycle(clientId: string, slot: number, current?: Video) {
    const now = new Date().toISOString();
    const q = !current
      ? db.from("client_videos").insert({ client_id: clientId, month, slot, status: "verstuurd", sent_at: now })
      : current.status === "verstuurd"
        ? db.from("client_videos").update({ status: "geplaatst", posted_at: now }).eq("id", current.id)
        : db.from("client_videos").delete().eq("id", current.id);
    const { error } = await q;
    if (error) toast.error(error.message); else onChange();
  }
  const label = new Date(month).toLocaleDateString("nl-BE", { month: "long" });
  return (
    <section className={card}>
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-sm font-medium">Video's · {label}</h2>
        <span className="text-[11px] text-white/45">tik: verstuurd → geplaatst</span>
      </div>
      {clients.length === 0 ? <p className="text-xs text-white/45">Geen klant met een videopakket.</p> : (
        <ul className="space-y-3">
          {clients.map((c) => {
            const mine = videos.filter((v) => v.client_id === c.id && v.slot);
            const n = Number(c.social_videos_per_month);
            const sent = mine.length, posted = mine.filter((v) => v.status === "geplaatst").length;
            return (
              <li key={c.id}>
                <div className="flex items-center gap-2 text-sm mb-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: colorOf[c.id] }} />
                  <span className="flex-1 truncate font-medium">{c.name.replace(/\s*\(.*\)$/, "")}</span>
                  <span className="text-[11px] text-white/50 tabular-nums">{sent}/{n} verstuurd · {posted} geplaatst</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from({ length: n }, (_, i) => {
                    const v = mine.find((x) => x.slot === i + 1);
                    const state = v?.status ?? "te maken";
                    return (
                      <button key={i} onClick={() => cycle(c.id, i + 1, v)} aria-label={`Video ${i + 1}: ${state}`} title={`Video ${i + 1}: ${state}`}
                        className={`press w-7 h-7 rounded-lg text-[11px] font-medium tabular-nums grid place-items-center border transition-colors ${v?.status === "geplaatst" ? "bg-emerald-500/25 border-emerald-400/60 text-emerald-300" : v ? "bg-sky-500/20 border-sky-400/60 text-sky-300" : "border-white/15 text-white/35 hover:border-white/40"}`}>
                        {v?.status === "geplaatst" ? <Check className="w-3.5 h-3.5" /> : i + 1}
                      </button>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
