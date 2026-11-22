import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { brusselsIso } from "@/lib/agenda";
import { googleCalendarUrl } from "@/lib/google-calendar-link";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** What you can put in your own agenda. The title starts with the type, so the Agenda colours and filters it. */
const TYPES = [
  { id: "block", label: "Werkblok", prefix: "Werkblok", len: 60 },
  { id: "meeting", label: "Afspraak", prefix: "Afspraak", len: 60 },
  { id: "meeting-collab", label: "Samenwerking", prefix: "Overleg", len: 60 },
  { id: "pathe", label: "Pathé", prefix: "Pathé", len: 480 },
  { id: "other", label: "Iets anders", prefix: "", len: 60 },
] as const;
type TypeId = (typeof TYPES)[number]["id"];
const LENGTHS = [30, 60, 90, 120, 180, 240, 480];
const lenLabel = (m: number) => (m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} u ${m % 60}` : `${m / 60} u`);
const field = "w-full h-11 rounded-xl border border-input bg-background px-3 text-base sm:text-sm";

export function AgendaNewItem({ day, onClose, onSaved }: { day: string; onClose: () => void; onSaved: () => void }) {
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [type, setType] = useState<TypeId>("block");
  const [client, setClient] = useState("");
  const [what, setWhat] = useState("");
  const [date, setDate] = useState(day);
  const [time, setTime] = useState("10:00");
  const [len, setLen] = useState(60);
  const [gcal, setGcal] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    db.from("clients").select("id, name, status").neq("status", "Write-off").order("name").then(({ data }: { data: { id: string; name: string }[] | null }) => setClients(data ?? []));
  }, []);
  const t = TYPES.find((x) => x.id === type)!;
  const clientName = clients.find((c) => c.id === client)?.name.replace(/\s*\(.*\)$/, "").replace(/\s+(BV|SRL|NV|Ltd)$/i, "");
  const title = [t.prefix, clientName, what.trim()].filter(Boolean).join(" · ") || "Bezet";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (type === "other" && !what.trim()) return toast.error("Geef het een naam.");
    const start = brusselsIso(date, time);
    const end = new Date(Date.parse(start) + len * 60000).toISOString();
    setBusy(true);
    const kind = type === "meeting-collab" ? "meeting" : type;
    const r = await db.from("calendar_busy").insert({ starts_at: start, ends_at: end, title, kind, client_id: client || null, source: "hub", synced_at: new Date().toISOString() });
    setBusy(false);
    if (r.error) return toast.error(`Opslaan lukte niet: ${r.error.message}`);
    toast.success("Ingepland");
    // a new tab has to open from the tap itself, otherwise phones block it
    if (gcal) window.open(googleCalendarUrl({ title, start, end, details: "Ingepland in Solyn Hub" }), "_blank", "noopener");
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
        <DialogHeader><DialogTitle>Inplannen</DialogTitle></DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div role="radiogroup" aria-label="Soort" className="flex flex-wrap gap-2">
            {TYPES.map((x) => (
              <button key={x.id} type="button" role="radio" aria-checked={type === x.id} onClick={() => { setType(x.id); setLen(x.len); }} className={`h-10 px-3.5 rounded-full border text-sm ${type === x.id ? "border-primary bg-primary/15 text-primary font-medium" : "border-border text-muted-foreground"}`}>
                {x.label}
              </button>
            ))}
          </div>
          {type !== "pathe" && (
            <label className="block text-sm">Klant
              <select value={client} onChange={(e) => setClient(e.target.value)} className={`${field} mt-1`}>
                <option value="">{type === "block" || type === "other" ? "Geen klant" : "Geen klant (bv. partner of prospect)"}</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          )}
          <label className="block text-sm">{type === "other" ? "Wat" : "Waarover (optioneel)"}
            <input value={what} onChange={(e) => setWhat(e.target.value)} maxLength={80} placeholder={type === "meeting-collab" ? "bv. samenwerking met fotograaf Lotte" : type === "meeting" ? "bv. intake nieuwe website" : ""} className={`${field} mt-1`} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">Dag<input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={`${field} mt-1`} /></label>
            <label className="block text-sm">Om<input type="time" required step={900} value={time} onChange={(e) => setTime(e.target.value)} className={`${field} mt-1`} /></label>
          </div>
          <div className="text-sm">Duur
            <div className="flex flex-wrap gap-1.5 mt-1">
              {LENGTHS.map((m) => (
                <button key={m} type="button" onClick={() => setLen(m)} aria-pressed={len === m} className={`h-9 px-3 rounded-full border text-sm ${len === m ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>{lenLabel(m)}</button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={gcal} onChange={(e) => setGcal(e.target.checked)} className="w-4 h-4" />Ook in Google Agenda zetten</label>
          <p className="text-xs text-muted-foreground rounded-xl bg-muted/40 px-3 py-2">In je agenda: <span className="text-foreground">{title}</span>, {lenLabel(len)}.{type === "block" ? " Een werkblok houdt je boekingslink niet tegen." : " Deze tijd is dan niet meer boekbaar via je boekingslink."}</p>
          <button disabled={busy} className="w-full h-12 rounded-full bg-primary text-primary-foreground font-medium inline-flex items-center justify-center gap-2 disabled:opacity-50"><CalendarPlus className="w-4 h-4" />{busy ? "Bezig…" : "Inplannen"}</button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
