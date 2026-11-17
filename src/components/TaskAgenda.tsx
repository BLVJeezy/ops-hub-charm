import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Pause, Pencil, Play, Plus, Repeat, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { brusselsToday } from "@/lib/invoice-schedule";
import { byDay, clock, dayBlocks, elapsed, groupByClient, groupTasks, dueLabel, lapTimes, spent, stepWord, weekday, type AgendaTask, type GroupKey } from "@/lib/task-agenda";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
type Client = { id: string; name: string; brand_color: string | null; status: string; is_internal: boolean | null };
const short = (n: string) => n.replace(/\s*\(.*\)$/, "").replace(/\s+(BV|BVBA|NV|SRL)$/i, "");

/**
 * The tasks, as simple as they get: what is late, what is for today, what comes this week. One tap ticks a task off.
 * Loads its own data, so it can sit on any page. Fixed (weekly/monthly) tasks are planned ahead by the Hub before it loads.
 */
export function TaskAgenda({ className = "", clientId, onChange, tick = 0 }: { className?: string; clientId?: string | null; onChange?: () => void; /** change it to make the list load again (another list on the page changed the tasks) */ tick?: number }) {
  const today = brusselsToday();
  const [tasks, setTasks] = useState<AgendaTask[] | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [open, setOpen] = useState<Partial<Record<GroupKey, boolean>>>({});
  const open_ = open;   // next week, later and undated start folded
  const [due, setDue] = useState("");
  const [title, setTitle] = useState("");
  const [forClient, setForClient] = useState("");
  const [repeat, setRepeat] = useState<"" | "weekly" | "monthly">("");
  const [now, setNow] = useState(() => Date.now());
  // on a phone the tasks show as a week calendar: tap a day, see that day
  const [narrow, setNarrow] = useState(false);
  useEffect(() => { const q = window.matchMedia("(max-width: 1023px)"); const on = () => setNarrow(q.matches); on(); q.addEventListener("change", on); return () => q.removeEventListener("change", on); }, []);
  const [day, setDay] = useState(today);
  const [weekOf, setWeekOf] = useState(today);
  const [editing, setEditing] = useState<string | null>(null);
  // two ways to read the same tasks: by date, or per client with the client that needs you first on top
  type View = "blocks" | "date" | "client";
  const [view, setView] = useState<View>("blocks");
  useEffect(() => { try { const v = localStorage.getItem("tasks-view"); if (v === "client" || v === "date" || v === "blocks") setView(v); } catch { /* no storage */ } }, []);
  const pick = (v: View) => { setView(v); try { localStorage.setItem("tasks-view", v); } catch { /* no storage */ } };
  // the day in blocks: one hour per project; which projects, and in what order, is kept per device
  const [blockIds, setBlockIds] = useState<string[] | null>(null);
  useEffect(() => { try { const v = JSON.parse(localStorage.getItem("task-blocks") || "null"); if (Array.isArray(v)) setBlockIds(v); } catch { /* no storage */ } }, []);
  const saveBlocks = (ids: string[]) => { setBlockIds(ids); try { localStorage.setItem("task-blocks", JSON.stringify(ids)); } catch { /* no storage */ } };
  const [blockDay, setBlockDay] = useState<"today" | "tomorrow">("today");
  const [editBlocks, setEditBlocks] = useState(false);
  const [rest, setRest] = useState(false);
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const [all, setAll] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState({ title: "", due: "", steps: "" });

  const load = useCallback(async () => {
    await db.rpc("generate_recurring_tasks").then(() => null, () => null);   // plan the fixed tasks ahead; never blocks the list
    const since = new Date(Date.now() - 36e5 * 18).toISOString();
    const [t, c] = await Promise.all([
      db.from("client_tasks").select("id,client_id,title,assignee,due_date,done_at,recurring_id,started_at,seconds,breaks,steps_total,steps_done,laps").or(`done_at.is.null,done_at.gte.${since}`).order("due_date", { ascending: true, nullsFirst: false }),
      db.from("clients").select("id,name,brand_color,status,is_internal").order("name"),
    ]);
    if (t.error) toast.error(t.error.message);
    setTasks((t.data ?? []) as AgendaTask[]); setClients((c.data ?? []) as Client[]);
  }, []);
  useEffect(() => { void load(); }, [load, tick]);
  useEffect(() => { setForClient(clientId ?? ""); }, [clientId]);

  const byId = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c])), [clients]);
  const shown = useMemo(() => (tasks ?? []).filter((t) => !clientId || t.client_id === clientId), [tasks, clientId]);
  const groups = useMemo(() => groupTasks(shown, today), [shown, today]);
  const openCount = shown.filter((t) => !t.done_at).length;

  const running = (tasks ?? []).find((t) => t.started_at && !t.done_at) ?? null;
  // the clock only ticks while something runs
  useEffect(() => { if (!running) return; setNow(Date.now()); const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, [running?.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  /** Change a task on screen at once, then in the Hub; on failure the list is loaded again. */
  async function patch(id: string, change: Partial<AgendaTask>) {
    setTasks((all) => (all ?? []).map((x) => (x.id === id ? { ...x, ...change } : x)));
    const { error } = await db.from("client_tasks").update(change).eq("id", id);
    if (error) { toast.error(error.message); void load(); } else onChange?.();
  }
  const bank = (t: AgendaTask) => ({ seconds: elapsed(t, Date.now()), started_at: null });   // stop the clock, keep the time
  async function start(t: AgendaTask) {
    if (running && running.id !== t.id) await patch(running.id, bank(running));              // one task at a time
    // picking a task up again after a stop is a break taken
    await patch(t.id, { started_at: new Date().toISOString(), breaks: Number(t.breaks || 0) + (Number(t.seconds || 0) > 0 ? 1 : 0) });
  }
  const stop = (t: AgendaTask) => patch(t.id, bank(t));
  async function stepDone(t: AgendaTask) {
    const at = elapsed(t, Date.now()), done = Number(t.steps_done || 0) + 1, last = !!t.steps_total && done >= t.steps_total;
    await patch(t.id, { steps_done: done, laps: [...(t.laps ?? []), at], ...(last ? { done_at: new Date().toISOString(), seconds: at, started_at: null } : {}) });
  }
  const toggle = (t: AgendaTask) => patch(t.id, t.done_at ? { done_at: null } : { done_at: new Date().toISOString(), ...(t.started_at ? bank(t) : {}) });
  function edit(t: AgendaTask) { setEditing(editing === t.id ? null : t.id); setDraft({ title: t.title, due: t.due_date ?? "", steps: t.steps_total ? String(t.steps_total) : "" }); }
  async function save(t: AgendaTask) {
    const title = draft.title.trim(); if (!title) return;
    const steps = Math.max(0, Math.min(50, Math.floor(Number(draft.steps) || 0)));
    await patch(t.id, { title, due_date: draft.due || null, steps_total: steps || null });   // the clock keeps running
    setEditing(null);
  }
  async function remove(t: AgendaTask) {
    setTasks((all) => (all ?? []).filter((x) => x.id !== t.id)); setEditing(null);
    const { error } = await db.from("client_tasks").delete().eq("id", t.id);
    if (error) { toast.error(error.message); void load(); } else onChange?.();
  }
  const Editor = (t: AgendaTask) => (
    <form onSubmit={(e) => { e.preventDefault(); void save(t); }} className="pb-3 pt-1 space-y-1.5">
      <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} aria-label="Titel" className="w-full h-10 rounded-xl border border-current/15 bg-transparent px-3 text-sm outline-none focus:border-current/40" />
      <div className="flex flex-wrap gap-1.5 items-center">
        <input type="date" value={draft.due} onChange={(e) => setDraft({ ...draft, due: e.target.value })} aria-label="Datum" className="h-10 rounded-xl border border-current/15 px-2 text-sm bg-transparent [color-scheme:dark]" />
        <label className="inline-flex items-center gap-1.5 text-xs opacity-80">Aantal stuks<input type="number" inputMode="numeric" min={0} max={50} value={draft.steps} onChange={(e) => setDraft({ ...draft, steps: e.target.value })} placeholder="0" className="w-16 h-10 rounded-xl border border-current/15 px-2 text-sm bg-transparent" /></label>
        <button type="submit" className="press h-10 px-4 rounded-xl bg-white text-black text-sm font-semibold ml-auto">Bewaar</button>
        <button type="button" onClick={() => remove(t)} aria-label="Verwijder taak" className="press hit w-10 h-10 rounded-xl grid place-items-center border border-current/15 text-red-400"><Trash2 className="w-4 h-4" /></button>
      </div>
    </form>
  );
  async function add(e: React.FormEvent) {
    e.preventDefault();
    const text = title.trim(); if (!text) return;
    const { data: u } = await supabase.auth.getUser();
    const d = new Date(today + "T12:00:00Z");
    const res = repeat
      ? await db.from("client_recurring_tasks").insert({ title: text, client_id: forClient || null, cadence: repeat, day: repeat === "weekly" ? d.getUTCDay() || 7 : Math.min(28, d.getUTCDate()), created_by: u.user?.id })
      : await db.from("client_tasks").insert({ title: text, client_id: forClient || null, assignee: "me", due_date: due || (narrow ? day : today), created_by: u.user?.id });
    if (res.error) return toast.error(res.error.message);
    setTitle(""); setRepeat(""); setDue(""); await load(); onChange?.();
  }

  const Row = (t: AgendaTask, group: GroupKey | "client" | "day") => {
    const c = t.client_id ? byId[t.client_id] : null, late = !t.done_at && !!t.due_date && t.due_date < today;
    const sec = elapsed(t, now), isRunning = !!t.started_at && !t.done_at, steps = Number(t.steps_total || 0);
    return (
      <li key={t.id}>
        <div className="flex items-center gap-2.5 min-h-[52px] py-1.5">
          <button type="button" onClick={() => toggle(t)} aria-pressed={!!t.done_at} aria-label={t.done_at ? `Zet terug: ${t.title}` : `Klaar: ${t.title}`} className="press hit shrink-0">
            <span className={`w-7 h-7 rounded-full grid place-items-center border-2 transition-colors ${t.done_at ? "bg-emerald-500 border-emerald-500 text-black" : late ? "border-red-400" : "border-current opacity-40"}`}>{t.done_at && <Check className="w-4 h-4" strokeWidth={3} />}</span>
          </button>
          <button type="button" onClick={() => edit(t)} aria-expanded={editing === t.id} className="min-w-0 flex-1 text-left">
            <span className={`block text-[15px] leading-snug ${t.done_at ? "line-through opacity-45" : ""}`}>{t.title}</span>
            <span className="flex flex-wrap items-center gap-x-1.5 text-xs opacity-60">
              {c && group !== "client" && <><span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.brand_color || "#8A93A6" }} /><span className="truncate">{short(c.name)}</span></>}
              {group !== "today" && group !== "day" && <span className={late ? "text-red-400 opacity-100 font-medium" : ""}>{dueLabel(t.due_date, today)}</span>}
              {t.assignee === "client" && <span>wacht op klant</span>}
              {steps > 0 && <span className="tabular-nums">{Number(t.steps_done || 0)}/{steps}</span>}
              {sec > 0 && !isRunning && <span className="tabular-nums">{spent(sec)}{Number(t.breaks) ? ` · ${t.breaks} ${t.breaks === 1 ? "pauze" : "pauzes"}` : ""}</span>}
              {t.recurring_id && <Repeat className="w-3 h-3" aria-label="vaste taak" />}
            </span>
          </button>
          {!t.done_at && (isRunning
            ? <span className="text-sm font-semibold tabular-nums text-emerald-400 shrink-0">{clock(sec)}</span>
            : <button type="button" onClick={() => start(t)} aria-label={`Start: ${t.title}`} className="press hit w-10 h-10 rounded-full grid place-items-center shrink-0 border border-current/20 hover:bg-current/10"><Play className="w-4 h-4 translate-x-px" /></button>)}
        </div>
        {editing === t.id && !isRunning && Editor(t)}
      </li>
    );
  };
  // the task on the clock gets its own card: the time, the breaks, and one button per finished piece
  const Running = (t: AgendaTask) => {
    const sec = elapsed(t, now), c = t.client_id ? byId[t.client_id] : null, steps = Number(t.steps_total || 0), done = Number(t.steps_done || 0), word = stepWord(t.title), laps = lapTimes(t.laps);
    return (
      <div className="rounded-2xl border border-emerald-400/50 bg-emerald-500/[0.08] p-3 mt-2">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-xs text-emerald-400 font-medium flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />Bezig{c ? ` · ${short(c.name)}` : ""}</div>
            <button type="button" onClick={() => edit(t)} className="block text-left text-[15px] font-medium leading-snug mt-0.5">{t.title} <Pencil className="inline w-3.5 h-3.5 opacity-50 -mt-0.5" /></button>
          </div>
          <div className="text-right shrink-0">
            <div className="text-3xl font-semibold tabular-nums leading-none">{clock(sec)}</div>
            <div className="text-xs opacity-60 mt-1">{Number(t.breaks || 0)} {Number(t.breaks) === 1 ? "pauze" : "pauzes"}</div>
          </div>
        </div>
        {laps.length > 0 && <div className="flex flex-wrap gap-1.5 mt-2">{laps.map((l, i) => <span key={i} className="text-xs rounded-full bg-emerald-500/15 text-emerald-300 px-2 py-0.5 tabular-nums">{word} {i + 1}: {spent(l)}</span>)}</div>}
        <div className="flex gap-2 mt-3">
          {steps > 0 && done < steps && <button type="button" onClick={() => stepDone(t)} className="press flex-1 h-11 rounded-xl bg-emerald-500 text-black text-sm font-semibold">{word} {done + 1} klaar{done + 1 === steps ? " · taak af" : ""}</button>}
          {steps === 0 && <button type="button" onClick={() => toggle(t)} className="press flex-1 h-11 rounded-xl bg-emerald-500 text-black text-sm font-semibold">Klaar</button>}
          <button type="button" onClick={() => stop(t)} className="press flex-1 h-11 rounded-xl border border-current/25 text-sm font-semibold inline-flex items-center justify-center gap-1.5"><Pause className="w-4 h-4" />Stop</button>
        </div>
        {editing === t.id && <div className="mt-2">{Editor(t)}</div>}
      </div>
    );
  };

  const addDays = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const monday = (iso: string) => addDays(iso, -((new Date(iso + "T12:00:00Z").getUTCDay() + 6) % 7));
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const Calendar = () => {
    const mon = monday(weekOf), days = Array.from({ length: 7 }, (_, n) => addDays(mon, n));
    const open = shown.filter((t) => !t.done_at);
    const late = open.filter((t) => t.due_date && t.due_date < today);
    const onDay = (d: string) => shown.filter((t) => t.due_date === d && (!t.done_at || (t.done_at && d === today)));
    const list = day === today ? [...late, ...onDay(day)] : onDay(day);
    const undated = open.filter((t) => !t.due_date);
    const MON = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
    const go = (n: number) => { const w = addDays(mon, n * 7); setWeekOf(w); setDay(n === 0 ? today : w <= today && today <= addDays(w, 6) ? today : w); };
    return (
      <div className="mt-2">
        <div className="flex items-center justify-between mb-1.5">
          <button type="button" onClick={() => go(-1)} aria-label="Vorige week" className="press hit w-9 h-9 grid place-items-center rounded-full"><ChevronLeft className="w-5 h-5" /></button>
          <button type="button" onClick={() => { setWeekOf(today); setDay(today); }} className="text-sm font-medium">{Number(mon.slice(8, 10))} {MON[Number(mon.slice(5, 7)) - 1]} – {Number(days[6].slice(8, 10))} {MON[Number(days[6].slice(5, 7)) - 1]}</button>
          <button type="button" onClick={() => go(1)} aria-label="Volgende week" className="press hit w-9 h-9 grid place-items-center rounded-full"><ChevronRight className="w-5 h-5" /></button>
        </div>
        <div className="grid grid-cols-7 gap-1 touch-pan-y" onPointerDown={(e) => { swipe.current = { x: e.clientX, y: e.clientY }; }}
          onPointerUp={(e) => { const s = swipe.current; swipe.current = null; if (!s) return; const dx = e.clientX - s.x; if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - s.y)) go(dx < 0 ? 1 : -1); }}>
          {days.map((d) => {
            const n = open.filter((t) => t.due_date === d).length + (d === today ? late.length : 0), sel = d === day, isToday = d === today, hasLate = d === today && late.length > 0;
            return (
              <button key={d} type="button" onClick={() => setDay(d)} aria-pressed={sel} aria-label={`${weekday(d)} ${Number(d.slice(8, 10))}: ${n} taken`}
                className={`press flex flex-col items-center gap-0.5 rounded-2xl py-2 transition-colors ${sel ? "bg-white text-black" : isToday ? "ring-1 ring-current/40" : ""} ${d < today && !sel ? "opacity-50" : ""}`}>
                <span className="text-[11px] uppercase opacity-70">{weekday(d)}</span>
                <span className="text-lg font-semibold leading-none tabular-nums">{Number(d.slice(8, 10))}</span>
                <span className="h-1.5 flex gap-0.5">{n > 0 && <span className={`w-1.5 h-1.5 rounded-full ${hasLate ? "bg-red-400" : sel ? "bg-black" : "bg-current"}`} />}{n > 2 && <span className={`w-1.5 h-1.5 rounded-full ${sel ? "bg-black" : "bg-current"} opacity-60`} />}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-3">
          <div className="text-sm font-semibold">{day === today ? "Vandaag" : day === addDays(today, 1) ? "Morgen" : dueLabel(day, today).replace(/^./, (c) => c.toUpperCase())}</div>
          {list.length === 0 ? <p className="text-sm opacity-60 py-3">Geen taken.</p> : <ul className="divide-y divide-current/10">{list.map((t) => Row(t, t.due_date && t.due_date < today && !t.done_at ? "late" : "today"))}</ul>}
        </div>
        {undated.length > 0 && (
          <div className="mt-2 rounded-2xl border border-current/10 px-3">
            <button type="button" onClick={() => setOpen((o) => ({ ...o, none: !o.none }))} aria-expanded={!!open_.none} className="press w-full flex items-center gap-2 min-h-11 text-left text-sm">
              <span className="flex-1 font-medium">Zonder datum</span><span className="text-xs opacity-70">{undated.length}</span><ChevronDown className={`w-4 h-4 opacity-60 transition-transform ${open_.none ? "rotate-180" : ""}`} />
            </button>
            {open_.none && <ul className="divide-y divide-current/10 pb-1">{undated.map((t) => Row(t, "none"))}</ul>}
          </div>
        )}
      </div>
    );
  };


  const BLOCK_MIN = 60;
  const defaultBlocks = () => ["amano", "dyna", "debl"].map((k) => clients.find((c) => c.status === "Active" && c.name.toLowerCase().includes(k))?.id).filter(Boolean) as string[];
  const Blocks = () => {
    const ids = (blockIds ?? defaultBlocks()).filter((id) => byId[id]);
    const d = blockDay === "today" ? today : addDays(today, 1);
    const blocks = dayBlocks(shown, ids, d, today, now);
    const other = shown.filter((t) => !ids.includes(t.client_id ?? "") && !t.done_at && (t.due_date === d || (d === today && !!t.due_date && t.due_date < today)));
    const active = clients.filter((c) => c.status === "Active" && !c.is_internal);
    return (
      <div className="mt-2 space-y-2">
        <div className="flex items-center gap-2">
          <span role="group" aria-label="Dag" className="inline-flex rounded-full border border-current/15 p-0.5 text-xs">
            {([["today", "Vandaag"], ["tomorrow", "Morgen"]] as const).map(([v, l]) => <button key={v} type="button" onClick={() => setBlockDay(v)} aria-pressed={blockDay === v} className={`press rounded-full px-3 h-7 ${blockDay === v ? "bg-white text-black font-semibold" : "opacity-70"}`}>{l}</button>)}
          </span>
          <span className="text-xs opacity-60">{blocks.length} {blocks.length === 1 ? "blok" : "blokken"} van 1 uur</span>
          <button type="button" onClick={() => setEditBlocks((v) => !v)} className="press ml-auto text-xs opacity-70 underline-offset-2 hover:underline min-h-8">{editBlocks ? "Klaar" : "Blokken aanpassen"}</button>
        </div>
        {editBlocks && (
          <div className="rounded-2xl border border-current/15 p-2 space-y-1">
            {[...ids.map((id) => byId[id]), ...active.filter((c) => !ids.includes(c.id))].filter(Boolean).map((c) => {
              const on = ids.includes(c.id), i = ids.indexOf(c.id);
              return (
                <div key={c.id} className="flex items-center gap-2 min-h-10">
                  <input type="checkbox" checked={on} onChange={() => saveBlocks(on ? ids.filter((x) => x !== c.id) : [...ids, c.id])} aria-label={short(c.name)} className="w-4 h-4" />
                  <span className="w-2 h-2 rounded-full" style={{ background: c.brand_color || "#8A93A6" }} />
                  <span className="text-sm flex-1">{short(c.name)}</span>
                  {on && i > 0 && <button type="button" onClick={() => { const n = [...ids]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; saveBlocks(n); }} aria-label="Eerder" className="press text-xs opacity-70 px-2 min-h-8">↑</button>}
                </div>
              );
            })}
          </div>
        )}
        {blocks.length === 0 && <p className="text-sm opacity-60 py-3">Nog geen blokken. Kies je projecten via "Blokken aanpassen".</p>}
        {blocks.map((b, n) => {
          const c = byId[b.clientId], color = c?.brand_color || "#8A93A6", min = Math.floor(b.seconds / 60), pct = Math.min(100, (b.seconds / (BLOCK_MIN * 60)) * 100);
          const first = b.tasks.find((t) => !t.done_at), live = !!running && b.tasks.some((t) => t.id === running.id);
          return (
            <div key={b.clientId} className={`rounded-2xl border px-3 pt-2.5 ${live ? "border-emerald-400/50" : "border-current/15"}`} style={{ boxShadow: `inset 3px 0 0 ${color}` }}>
              <div className="flex items-center gap-2">
                <span className="text-xs opacity-55 tabular-nums">Blok {n + 1}</span>
                <span className="text-sm font-semibold truncate">{c ? short(c.name) : ""}</span>
                <span className="ml-auto text-xs tabular-nums opacity-70">{min} / {BLOCK_MIN} min</span>
                {first && !live && <button type="button" onClick={() => start(first)} aria-label={`Start blok ${c ? short(c.name) : ""}`} className="press h-8 px-3 rounded-full bg-white text-black text-xs font-semibold inline-flex items-center gap-1"><Play className="w-3 h-3" />Start</button>}
              </div>
              <div className="h-1 rounded-full bg-current/10 mt-2 overflow-hidden" style={{ backgroundColor: "color-mix(in srgb, currentColor 10%, transparent)" }}><div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} /></div>
              {b.upcoming && <p className="text-xs opacity-60 pt-2">Niets gepland voor {blockDay === "today" ? "vandaag" : "morgen"}. Dit kan je al vooruit doen:</p>}
              {b.tasks.length === 0 ? <p className="text-sm opacity-60 py-3">Geen open taken.</p> : <ul className="divide-y divide-current/10">{b.tasks.map((t) => Row(t, "client"))}</ul>}
            </div>
          );
        })}
        {other.length > 0 && (
          <div className="rounded-2xl border border-current/10 px-3">
            <button type="button" onClick={() => setRest((v) => !v)} aria-expanded={rest} className="press w-full flex items-center gap-2 min-h-11 text-left text-sm">
              <span className="flex-1 font-medium">Buiten de blokken</span><span className="text-xs opacity-70">{other.length}</span><ChevronDown className={`w-4 h-4 opacity-60 transition-transform ${rest ? "rotate-180" : ""}`} />
            </button>
            {rest && <ul className="divide-y divide-current/10 pb-1">{other.map((t) => Row(t, t.due_date && t.due_date < today ? "late" : "today"))}</ul>}
          </div>
        )}
      </div>
    );
  };

  const PerClient = () => {
    const list = groupByClient(shown, today);
    if (!list.length) return <p className="text-sm opacity-60 py-3">Geen open taken.</p>;
    return (
      <div className="space-y-2 mt-2">
        {list.map((g) => {
          const key = g.clientId ?? "none", c = g.clientId ? byId[g.clientId] : null, color = c?.brand_color || "#8A93A6";
          const urgent = g.late + g.today + g.week > 0, isOpen = folded[key] === undefined ? urgent : !folded[key];
          const max = 6, more = g.tasks.length - max, tasks = all[key] ? g.tasks : g.tasks.slice(0, max);
          return (
            <div key={key} className={`rounded-2xl border px-3 ${g.late ? "border-red-400/50 bg-red-500/[0.06]" : "border-current/10"}`} style={{ boxShadow: `inset 3px 0 0 ${color}` }}>
              <button type="button" onClick={() => setFolded((f) => ({ ...f, [key]: isOpen }))} aria-expanded={isOpen} className="press w-full flex items-center gap-2 min-h-12 text-left">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                <span className="text-sm font-semibold truncate">{c ? short(c.name) : "Zonder klant"}</span>
                <span className="flex flex-wrap gap-1 ml-1">
                  {g.late > 0 && <span className="text-[11px] rounded-full bg-red-500/20 text-red-300 px-2 py-0.5 font-medium">{g.late} te laat</span>}
                  {g.today > 0 && <span className="text-[11px] rounded-full bg-white text-black px-2 py-0.5 font-medium">{g.today} vandaag</span>}
                  {g.week > 0 && <span className="text-[11px] rounded-full border border-current/25 px-2 py-0.5">{g.week} deze week</span>}
                  {!urgent && g.next && <span className="text-[11px] opacity-60 px-1 py-0.5">volgende: {dueLabel(g.next, today)}</span>}
                </span>
                <span className="ml-auto text-xs tabular-nums opacity-70 shrink-0">{g.open}</span>
                <ChevronDown className={`w-4 h-4 opacity-60 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>
              {isOpen && (
                <>
                  <ul className="divide-y divide-current/10">{tasks.map((t) => Row(t, "client"))}</ul>
                  {more > 0 && <button type="button" onClick={() => setAll((a) => ({ ...a, [key]: !a[key] }))} className="press text-xs opacity-70 min-h-10">{all[key] ? "Minder tonen" : `Toon nog ${more}`}</button>}
                </>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <section className={className} aria-label="Taken">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-base font-semibold">Taken</h2>
        {!clientId && (
          <span role="group" aria-label="Weergave" className="ml-auto mr-2 inline-flex rounded-full border border-current/15 p-0.5 text-xs">
            {([["blocks", "Blokken"], ["date", narrow ? "Kalender" : "Datum"], ["client", "Klant"]] as const).map(([v, l]) => (
              <button key={v} type="button" onClick={() => pick(v)} aria-pressed={view === v} className={`press rounded-full px-2.5 h-7 ${view === v ? "bg-white text-black font-semibold" : "opacity-70"}`}>{l}</button>
            ))}
          </span>
        )}
        <span className="text-xs opacity-60 tabular-nums">{tasks ? `${openCount} open` : ""}</span>
      </div>
      {!tasks ? <p className="text-sm opacity-60 py-3">Laden…</p> : (
        <>
          {running && (!clientId || running.client_id === clientId) && Running(running)}
          {view === "blocks" && !clientId ? Blocks() : view === "client" && !clientId ? PerClient() : narrow ? Calendar() : (
            <>
          {!groups.some((g) => g.key === "late" || g.key === "today" || g.key === "week") && <p className="text-sm opacity-60 py-3">Niets meer voor deze week.</p>}
          <div className="space-y-2 mt-2">
            {groups.map((g) => {
              const fold = g.key === "next" || g.key === "later" || g.key === "none", shown = !fold || !!open[g.key], n = g.tasks.filter((t) => !t.done_at).length;
              const tone = g.key === "late" ? "border-red-400/50 bg-red-500/[0.07]" : g.key === "today" ? "border-current/25" : "border-current/10";
              const head = (
                <span className="flex items-baseline gap-2 min-w-0">
                  <span className={`text-sm font-semibold ${g.key === "late" ? "text-red-400" : ""}`}>{g.label}</span>
                  {g.range && <span className="text-xs opacity-55 truncate">{g.range}</span>}
                  <span className="ml-auto text-xs tabular-nums opacity-70 shrink-0">{n}</span>
                </span>
              );
              return (
                <div key={g.key} className={`rounded-2xl border px-3 ${tone}`} style={g.key === "today" ? { backgroundColor: "color-mix(in srgb, currentColor 5%, transparent)" } : undefined}>
                  {fold ? (
                    <button type="button" onClick={() => setOpen((o) => ({ ...o, [g.key]: !o[g.key] }))} aria-expanded={shown} className="press w-full flex items-center gap-2 min-h-11 text-left">
                      <span className="flex-1 min-w-0">{head}</span><ChevronDown className={`w-4 h-4 opacity-60 transition-transform ${shown ? "rotate-180" : ""}`} />
                    </button>
                  ) : <div className="pt-2.5">{head}</div>}
                  {shown && (g.key === "week" || g.key === "next" || g.key === "later"
                    ? <div className="pb-1">{byDay(g.tasks).map((d) => (
                        <div key={d.day ?? "x"}>
                          <div className="text-[11px] font-semibold uppercase tracking-wide opacity-55 pt-2">{d.day ? dueLabel(d.day, today) : ""}</div>
                          <ul className="divide-y divide-current/10">{d.tasks.map((t) => Row(t, "day"))}</ul>
                        </div>))}</div>
                    : <ul className="divide-y divide-current/10 pb-1">{g.tasks.map((t) => Row(t, g.key))}</ul>)}
                </div>
              );
            })}
          </div>
            </>
          )}
          <form onSubmit={add} className="mt-3 space-y-1.5">
            <div className="flex gap-1.5">
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nieuwe taak…" aria-label="Nieuwe taak" className="flex-1 min-w-0 h-11 rounded-xl bg-current/5 border border-current/15 px-3 text-[15px] placeholder:opacity-50 outline-none focus:border-current/40" style={{ backgroundColor: "color-mix(in srgb, currentColor 6%, transparent)" }} />
              <button type="submit" aria-label="Taak toevoegen" disabled={!title.trim()} className="press w-11 h-11 rounded-xl bg-white text-black grid place-items-center disabled:opacity-40"><Plus className="w-5 h-5" /></button>
            </div>
            {title.trim() && (
              <div className="flex flex-wrap gap-1.5">
                {!clientId && (
                  <select value={forClient} onChange={(e) => setForClient(e.target.value)} aria-label="Klant" className="flex-1 min-w-0 h-10 rounded-xl border border-current/15 px-2 text-sm bg-transparent [&>option]:text-black">
                    <option value="">Geen klant</option>
                    {clients.filter((c) => c.status === "Active" && !c.is_internal).map((c) => <option key={c.id} value={c.id}>{short(c.name)}</option>)}
                  </select>
                )}
                {!repeat && <input type="date" value={due} min={today} onChange={(e) => setDue(e.target.value)} aria-label="Datum" className="h-10 rounded-xl border border-current/15 px-2 text-sm bg-transparent [color-scheme:dark]" />}
                <select value={repeat} onChange={(e) => setRepeat(e.target.value as typeof repeat)} aria-label="Herhalen" className="flex-1 min-w-0 h-10 rounded-xl border border-current/15 px-2 text-sm bg-transparent [&>option]:text-black">
                  <option value="">Eenmalig</option>
                  <option value="weekly">Elke week op deze dag</option>
                  <option value="monthly">Elke maand op deze dag</option>
                </select>
              </div>
            )}
          </form>
        </>
      )}
    </section>
  );
}
