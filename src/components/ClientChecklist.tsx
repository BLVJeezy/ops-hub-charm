import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, Check, ChevronDown, Circle, CircleDot, Loader2, Minus, Plus, ScanSearch, Sparkles, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { GROUPS, isDone, merge, progress, type Group, type Row, type View } from "@/lib/site-checklist";
import { nextStep, overall, phases, type PhaseStatus } from "@/lib/site-process";
import { scanChecklist } from "@/lib/site-checklist.functions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** Launch checklist for the client's website: pages, domain and e-mail, findability, handover. */
export function ClientChecklist({ clientId }: { clientId: string }) {
  const scan = useServerFn(scanChecklist);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [adding, setAdding] = useState<Group | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [editingNoteKey, setEditingNoteKey] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [pendingGroup, setPendingGroup] = useState<Group | null>(null);
  const groupRefs = useRef<Partial<Record<Group, HTMLDivElement | null>>>({});
  const load = useCallback(async () => {
    const { data } = await db.from("client_checklist").select("key, label, grp, state, note, auto_state, auto_detail, auto_at").eq("client_id", clientId);
    const r = (data ?? []) as Row[];
    setRows(r);
    setLastScan(r.map((x) => x.auto_at).filter(Boolean).sort().pop() ?? null);
  }, [clientId]);
  useEffect(() => void load(), [load]);
  useEffect(() => {
    if (!open || !pendingGroup) return;
    const el = groupRefs.current[pendingGroup];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    setPendingGroup(null);
  }, [open, pendingGroup]);
  const items = useMemo(() => merge(rows ?? []), [rows]);
  const p = progress(items);
  const phaseList = useMemo(() => phases(items), [items]);
  const ov = useMemo(() => overall(phaseList), [phaseList]);
  const next = useMemo(() => nextStep(phaseList), [phaseList]);

  async function setState(v: View, state: Row["state"]) {
    const clearNote = state === "klaar";
    setRows((rs) => {
      const list = [...(rs ?? [])];
      const i = list.findIndex((r) => r.key === v.key);
      if (i >= 0) list[i] = { ...list[i], state, ...(clearNote ? { note: null } : {}) };
      else list.push({ key: v.key, label: null, grp: null, state, note: null, auto_state: null, auto_detail: null, auto_at: null });
      return list;
    });
    if (clearNote && editingNoteKey === v.key) setEditingNoteKey(null);
    const { data: u } = await supabase.auth.getUser();
    const payload: Record<string, unknown> = { client_id: clientId, key: v.key, state, updated_by: u.user?.id ?? null, updated_at: new Date().toISOString() };
    if (clearNote) payload["note"] = null;
    const r = await db.from("client_checklist").upsert(payload, { onConflict: "client_id,key" });
    if (r.error) { toast.error(r.error.message); void load(); }
  }

  async function saveNote(v: View, rawNote: string) {
    const note = rawNote.trim() || null;
    setRows((rs) => {
      const list = [...(rs ?? [])];
      const i = list.findIndex((r) => r.key === v.key);
      if (i >= 0) list[i] = { ...list[i], note };
      else list.push({ key: v.key, label: null, grp: null, state: v.state, note, auto_state: null, auto_detail: null, auto_at: null });
      return list;
    });
    setEditingNoteKey(null);
    const { data: u } = await supabase.auth.getUser();
    const r = await db.from("client_checklist").upsert(
      { client_id: clientId, key: v.key, state: v.state, note, updated_by: u.user?.id ?? null, updated_at: new Date().toISOString() },
      { onConflict: "client_id,key" },
    );
    if (r.error) { toast.error(r.error.message); void load(); }
  }

  function jumpToGroup(group: Group) {
    setOpen(true);
    setPendingGroup(group);
  }
  async function runScan() {
    setScanning(true);
    try {
      const r = await scan({ data: { client_id: clientId } });
      toast.success(`${r.ok} van ${r.checked} punten in orde op ${r.url.replace(/^https?:\/\//, "")}`);
      setOpen(true);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nakijken lukte niet");
    } finally {
      setScanning(false);
    }
  }
  async function addItem(g: Group) {
    const label = newLabel.trim();
    if (label.length < 2) return;
    const r = await db.from("client_checklist").insert({ client_id: clientId, key: `x-${crypto.randomUUID().slice(0, 8)}`, label: label.slice(0, 120), grp: g });
    if (r.error) return toast.error(r.error.message);
    setNewLabel("");
    setAdding(null);
    void load();
  }
  async function removeItem(v: View) {
    const r = await db.from("client_checklist").delete().eq("client_id", clientId).eq("key", v.key);
    if (r.error) return toast.error(r.error.message);
    void load();
  }

  if (!rows) return null;
  const color = p.pct === 100 ? "bg-emerald-500" : p.pct >= 60 ? "bg-primary" : "bg-amber-400";
  return (
    <section className="rounded-xl border border-border bg-card mb-4 overflow-hidden">
      <div className="p-4">
        <div className="flex items-start gap-3">
          <button onClick={() => setOpen(!open)} className="flex-1 min-w-0 text-left" aria-expanded={open}>
            <div className="flex items-center gap-2 text-sm font-semibold">
              Website-checklist
              <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
            </div>
            <div className={`text-xs mt-0.5 font-medium ${ov.live ? "text-emerald-400" : next?.status === "geblokkeerd" ? "text-amber-400" : "text-foreground/80"}`}>
              {ov.live ? "Volledig opgeleverd" : next ? `Volgende stap: ${next.label}` : ""}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {p.done} van {p.total} klaar{lastScan ? ` · laatst nagekeken ${new Date(lastScan).toLocaleDateString("nl-BE", { day: "numeric", month: "short" })}` : ""}
            </div>
          </button>
          <button onClick={() => void runScan()} disabled={scanning} className="shrink-0 h-10 px-3.5 rounded-full border border-border text-sm inline-flex items-center gap-2 disabled:opacity-50">
            {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanSearch className="w-4 h-4" />}
            <span className="hidden sm:inline">{scanning ? "Nakijken…" : "Site nakijken"}</span>
            <span className="sm:hidden">{scanning ? "…" : "Nakijken"}</span>
          </button>
        </div>
        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" role="list" aria-label="Opleveringsfasen">
          {phaseList.map((ph) => (
            <button
              key={ph.id}
              type="button"
              onClick={() => jumpToGroup(ph.group)}
              className={`shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border text-xs transition ${phaseChipClass(ph.status)}`}
              title={ph.blockers[0] ? `Geblokkeerd: ${ph.blockers[0].note}` : `${ph.label}: ${ph.done}/${ph.total}`}
            >
              <PhaseIcon status={ph.status} />
              <span>{ph.label}</span>
            </button>
          ))}
        </div>
        <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuenow={p.pct} aria-valuemin={0} aria-valuemax={100}>
          <div className={`h-full ${color} transition-all`} style={{ width: `${p.pct}%` }} />
        </div>
      </div>

      {open && (
        <div className="border-t border-border">
          {GROUPS.map((g) => {
            const list = items.filter((v) => v.group === g.id);
            const gp = progress(list);
            return (
              <div key={g.id} ref={(el) => { groupRefs.current[g.id] = el; }} className="px-4 py-3 border-b border-border last:border-b-0 scroll-mt-4">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-xs font-semibold text-muted-foreground">{g.label}</h3>
                  <span className="text-xs text-muted-foreground tabular-nums">{gp.done}/{gp.total}</span>
                </div>
                <ul>
                  {list.map((v) => (
                    <ItemRow
                      key={v.key}
                      v={v}
                      editingNote={editingNoteKey === v.key}
                      noteDraft={editingNoteKey === v.key ? noteDraft : ""}
                      onStartNote={() => { setEditingNoteKey(v.key); setNoteDraft(v.note ?? ""); }}
                      onNoteDraft={setNoteDraft}
                      onSaveNote={(val) => void saveNote(v, val)}
                      onCancelNote={() => setEditingNoteKey(null)}
                      onState={(s) => void setState(v, s)}
                      onRemove={v.custom ? () => void removeItem(v) : undefined}
                    />
                  ))}
                </ul>
                {adding === g.id ? (
                  <form onSubmit={(e) => { e.preventDefault(); void addItem(g.id); }} className="flex gap-2 mt-2">
                    <input autoFocus value={newLabel} onChange={(e) => setNewLabel(e.target.value)} maxLength={120} placeholder="Wat moet er nog gebeuren?" className="flex-1 min-w-0 h-10 rounded-lg border border-input bg-background px-3 text-base sm:text-sm" />
                    <button className="h-10 px-3.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium">Toevoegen</button>
                  </form>
                ) : (
                  <button onClick={() => { setAdding(g.id); setNewLabel(""); }} className="mt-1 h-9 text-xs text-muted-foreground inline-flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" />Punt toevoegen</button>
                )}
              </div>
            );
          })}
          <p className="px-4 py-3 text-xs text-muted-foreground flex gap-1.5"><Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5" />"Site nakijken" bekijkt de live website en het domein: pagina's, https, e-mail (MX, SPF, DMARC), sitemap, meta, schema. Wat het vindt krijgt een groen bolletje; jouw eigen vinkjes blijven altijd staan.</p>
        </div>
      )}
    </section>
  );
}

function phaseChipClass(status: PhaseStatus) {
  switch (status) {
    case "klaar": return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
    case "bezig": return "border-primary/40 bg-primary/10 text-primary";
    case "geblokkeerd": return "border-amber-500/50 bg-amber-500/10 text-amber-300";
    case "nvt": return "border-border/50 text-muted-foreground/60 line-through";
    default: return "border-border bg-background/40 text-muted-foreground";
  }
}

function PhaseIcon({ status }: { status: PhaseStatus }) {
  if (status === "klaar") return <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
  if (status === "bezig") return <CircleDot className="w-3.5 h-3.5 text-primary shrink-0" />;
  if (status === "geblokkeerd") return <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
  if (status === "nvt") return <Minus className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />;
  return <Circle className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />;
}

function notePlaceholder(group: Group) {
  if (group === "start") return "wacht op logo van klant";
  if (group === "domein") return "klant heeft geen toegang tot DNS";
  return "wacht op klant of ontbrekende info";
}

function ItemRow({
  v,
  editingNote,
  noteDraft,
  onStartNote,
  onNoteDraft,
  onSaveNote,
  onCancelNote,
  onState,
  onRemove,
}: {
  v: View;
  editingNote: boolean;
  noteDraft: string;
  onStartNote: () => void;
  onNoteDraft: (val: string) => void;
  onSaveNote: (val: string) => void;
  onCancelNote: () => void;
  onState: (s: Row["state"]) => void;
  onRemove?: () => void;
}) {
  const done = isDone(v);
  const na = v.state === "nvt";
  return (
    <li className="py-2">
      <div className="flex items-start gap-2.5">
        <button
          onClick={() => onState(v.state === "klaar" ? "open" : "klaar")}
          aria-label={v.state === "klaar" ? `${v.label}: terug openzetten` : `${v.label}: afvinken`}
          className={`mt-0.5 w-7 h-7 shrink-0 rounded-full border-2 grid place-items-center ${v.state === "klaar" ? "bg-emerald-500 border-emerald-500 text-black" : done ? "border-emerald-500 text-emerald-400" : na ? "border-muted-foreground/30" : "border-muted-foreground/50"}`}
        >
          {done && <Check className="w-4 h-4" />}
          {na && <Minus className="w-4 h-4 text-muted-foreground" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className={`text-sm leading-snug ${na ? "line-through text-muted-foreground" : ""}`}>{v.label}</div>
          {v.note && !na && !done && (
            <div className="text-xs mt-0.5 text-amber-400">Wacht: {v.note}</div>
          )}
          {(v.auto_detail || v.hint) && !na && (
            <div className={`text-xs mt-0.5 ${v.auto_state === "ok" ? "text-emerald-400" : v.auto_state === "mis" && v.state !== "klaar" ? "text-amber-400" : "text-muted-foreground"}`}>
              {v.auto_detail ? `${v.auto_state === "ok" ? "Gevonden" : "Niet gevonden"}: ${v.auto_detail}` : v.hint}
            </div>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {!done && !na && (
            <button
              type="button"
              onClick={onStartNote}
              className={`h-8 px-2 rounded-full text-xs ${v.note ? "text-amber-400 hover:text-amber-300" : "text-muted-foreground hover:text-foreground"}`}
            >
              Waarom?
            </button>
          )}
          <button onClick={() => onState(na ? "open" : "nvt")} className="h-8 px-2 rounded-full text-xs text-muted-foreground hover:text-foreground">{na ? "Toch nodig" : "n.v.t."}</button>
          {onRemove && <button onClick={onRemove} aria-label="Punt verwijderen" className="w-8 h-8 grid place-items-center text-muted-foreground hover:text-red-300"><Trash2 className="w-3.5 h-3.5" /></button>}
        </div>
      </div>
      {editingNote && (
        <form
          onSubmit={(e) => { e.preventDefault(); onSaveNote(noteDraft); }}
          className="mt-2 ml-9 flex flex-wrap sm:flex-nowrap gap-2"
        >
          <input
            autoFocus
            value={noteDraft}
            onChange={(e) => onNoteDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") onCancelNote(); }}
            maxLength={200}
            placeholder={notePlaceholder(v.group)}
            className="flex-1 min-w-0 h-9 rounded-lg border border-input bg-background px-2.5 text-sm"
          />
          <div className="flex gap-1.5 shrink-0">
            <button type="submit" className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium">Opslaan</button>
            <button type="button" onClick={onCancelNote} className="h-9 px-2.5 rounded-lg border border-border text-xs text-muted-foreground">Annuleren</button>
          </div>
        </form>
      )}
    </li>
  );
}
