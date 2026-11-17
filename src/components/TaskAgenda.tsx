import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Plus, Repeat } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { brusselsToday } from "@/lib/invoice-schedule";
import { groupTasks, dueLabel, weekday, type AgendaTask, type GroupKey } from "@/lib/task-agenda";
import { ChevronDown } from "lucide-react";

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
  const [open, setOpen] = useState<Partial<Record<GroupKey, boolean>>>({});   // next week, later and undated start folded
  const [due, setDue] = useState("");
  const [title, setTitle] = useState("");
  const [forClient, setForClient] = useState("");
  const [repeat, setRepeat] = useState<"" | "weekly" | "monthly">("");

  const load = useCallback(async () => {
    await db.rpc("generate_recurring_tasks").then(() => null, () => null);   // plan the fixed tasks ahead; never blocks the list
    const since = new Date(Date.now() - 36e5 * 18).toISOString();
    const [t, c] = await Promise.all([
      db.from("client_tasks").select("id,client_id,title,assignee,due_date,done_at,recurring_id").or(`done_at.is.null,done_at.gte.${since}`).order("due_date", { ascending: true, nullsFirst: false }),
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

  async function toggle(t: AgendaTask) {
    const done_at = t.done_at ? null : new Date().toISOString();
    setTasks((all) => (all ?? []).map((x) => (x.id === t.id ? { ...x, done_at } : x)));     // answer the tap at once
    const { error } = await db.from("client_tasks").update({ done_at }).eq("id", t.id);
    if (error) { toast.error(error.message); void load(); } else onChange?.();
  }
  async function add(e: React.FormEvent) {
    e.preventDefault();
    const text = title.trim(); if (!text) return;
    const { data: u } = await supabase.auth.getUser();
    const d = new Date(today + "T12:00:00Z");
    const res = repeat
      ? await db.from("client_recurring_tasks").insert({ title: text, client_id: forClient || null, cadence: repeat, day: repeat === "weekly" ? d.getUTCDay() || 7 : Math.min(28, d.getUTCDate()), created_by: u.user?.id })
      : await db.from("client_tasks").insert({ title: text, client_id: forClient || null, assignee: "me", due_date: due || today, created_by: u.user?.id });
    if (res.error) return toast.error(res.error.message);
    setTitle(""); setRepeat(""); setDue(""); await load(); onChange?.();
  }

  const Row = (t: AgendaTask, group: GroupKey) => {
    const c = t.client_id ? byId[t.client_id] : null, late = !t.done_at && !!t.due_date && t.due_date < today;
    return (
      <li key={t.id}>
        <button type="button" onClick={() => toggle(t)} aria-pressed={!!t.done_at} className="press w-full flex items-center gap-3 min-h-[52px] py-1.5 text-left">
          {(group === "week" || group === "next") && t.due_date && <span className="w-7 shrink-0 text-xs font-semibold uppercase opacity-70 text-center">{weekday(t.due_date)}</span>}
          <span className={`w-7 h-7 rounded-full grid place-items-center shrink-0 border-2 transition-colors ${t.done_at ? "bg-emerald-500 border-emerald-500 text-black" : late ? "border-red-400" : "border-current opacity-40"}`}>{t.done_at && <Check className="w-4 h-4" strokeWidth={3} />}</span>
          <span className="min-w-0 flex-1">
            <span className={`block text-[15px] leading-snug ${t.done_at ? "line-through opacity-45" : ""}`}>{t.title}</span>
            <span className="flex items-center gap-1.5 text-xs opacity-60">
              {c && <><span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.brand_color || "#8A93A6" }} /><span className="truncate">{short(c.name)}</span></>}
              {group !== "today" && group !== "week" && group !== "next" && <span className={late ? "text-red-400 opacity-100 font-medium" : ""}>{dueLabel(t.due_date, today)}</span>}
              {t.assignee === "client" && <span>wacht op klant</span>}
              {t.recurring_id && <Repeat className="w-3 h-3" aria-label="vaste taak" />}
            </span>
          </span>
        </button>
      </li>
    );
  };

  return (
    <section className={className} aria-label="Taken">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-base font-semibold">Taken</h2>
        <span className="text-xs opacity-60 tabular-nums">{tasks ? `${openCount} open` : ""}</span>
      </div>
      {!tasks ? <p className="text-sm opacity-60 py-3">Laden…</p> : (
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
                  {shown && <ul className="divide-y divide-current/10 pb-1">{g.tasks.map((t) => Row(t, g.key))}</ul>}
                </div>
              );
            })}
          </div>
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
