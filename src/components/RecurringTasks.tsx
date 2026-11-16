import { useCallback, useEffect, useState } from "react";
import { Repeat, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
type Row = { id: string; title: string; cadence: "weekly" | "monthly"; day: number; assignee: string };
const WEEKDAY = ["", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"];
export const cadenceLabel = (r: { cadence: string; day: number }) => (r.cadence === "weekly" ? `Elke ${WEEKDAY[r.day] ?? "week"}` : `Elke maand op de ${r.day}e`);

/** A client's fixed tasks: what comes back every week or month. Add one, or stop one (its open future tasks go with it). */
export function RecurringTasks({ clientId, onChange }: { clientId: string; onChange?: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [title, setTitle] = useState("");
  const [cadence, setCadence] = useState<"weekly" | "monthly">("weekly");
  const [day, setDay] = useState(1);
  const load = useCallback(async () => {
    const { data, error } = await db.from("client_recurring_tasks").select("id,title,cadence,day,assignee").eq("client_id", clientId).eq("active", true).order("cadence").order("day");
    if (error) toast.error(error.message);
    setRows((data ?? []) as Row[]);
  }, [clientId]);
  useEffect(() => { void load(); }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const { data: u } = await supabase.auth.getUser();
    const { error } = await db.from("client_recurring_tasks").insert({ client_id: clientId, title: title.trim(), cadence, day, created_by: u.user?.id });
    if (error) return toast.error(error.message);
    setTitle(""); await db.rpc("generate_recurring_tasks").then(() => null, () => null); await load(); onChange?.();
  }
  async function stop(r: Row) {
    const today = new Date().toISOString().slice(0, 10);
    await db.from("client_tasks").delete().eq("recurring_id", r.id).is("done_at", null).gte("due_date", today);
    const { error } = await db.from("client_recurring_tasks").delete().eq("id", r.id);
    if (error) toast.error(error.message); else { await load(); onChange?.(); }
  }
  const field = "h-10 rounded-xl border border-white/15 bg-transparent px-2 text-sm [&>option]:text-black";
  return (
    <section>
      <h3 className="text-xs font-medium text-white/50 mb-2 flex items-center gap-1.5"><Repeat className="w-3.5 h-3.5" />Vaste taken</h3>
      {!rows ? <p className="text-sm text-white/40">Laden…</p> : rows.length === 0 ? <p className="text-sm text-white/40">Nog geen vaste taken.</p> : (
        <ul className="space-y-1 text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-2 min-h-10">
              <span className="flex-1 min-w-0"><span className="block truncate">{r.title}</span><span className="block text-xs text-white/50">{cadenceLabel(r)}</span></span>
              <button onClick={() => stop(r)} aria-label={`Stop ${r.title}`} className="press hit w-9 h-9 rounded-full grid place-items-center text-white/50 hover:text-white hover:bg-white/10"><X className="w-4 h-4" /></button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="mt-2 space-y-1.5">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nieuwe vaste taak…" aria-label="Nieuwe vaste taak" className={`${field} w-full px-3`} />
        {title.trim() && (
          <div className="flex gap-1.5">
            <select value={cadence} onChange={(e) => { const c = e.target.value as "weekly" | "monthly"; setCadence(c); setDay(1); }} aria-label="Hoe vaak" className={`${field} flex-1`}><option value="weekly">Elke week</option><option value="monthly">Elke maand</option></select>
            <select value={day} onChange={(e) => setDay(Number(e.target.value))} aria-label="Welke dag" className={`${field} flex-1`}>
              {cadence === "weekly" ? WEEKDAY.slice(1).map((w, i) => <option key={w} value={i + 1}>{w}</option>) : Array.from({ length: 28 }, (_, i) => <option key={i} value={i + 1}>de {i + 1}e</option>)}
            </select>
            <button type="submit" className="press h-10 px-4 rounded-xl bg-white text-black text-sm font-semibold">Voeg toe</button>
          </div>
        )}
      </form>
    </section>
  );
}
