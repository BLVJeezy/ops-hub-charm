import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { WAITING_PERIODS, WAITING_PERIOD_DAYS, ACTION_STATUSES } from "@/lib/constants";
import { todayISO } from "@/lib/format";

export type ActionRow = {
  id?: string;
  client: string;
  action_description: string;
  start_date?: string | null;
  waiting_period: string;
  due_date?: string | null;
  status: string;
  result?: string | null;
  notes?: string | null;
};

const EMPTY: ActionRow = {
  client: "", action_description: "", start_date: todayISO(),
  waiting_period: "1 week", due_date: null, status: "Planned", result: "", notes: "",
};

function addDays(iso: string, days: number): string {
  const d = new Date(iso); d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function autoDue(start: string | null | undefined, waiting: string): string | null {
  if (!start) return null;
  const days = WAITING_PERIOD_DAYS[waiting];
  return days == null ? null : addDays(start, days);
}

type Client = { id: string; name: string };

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: Partial<ActionRow> & { id?: string };
  clients: Client[];
  defaultClientId?: string;
  onSaved?: () => void;
};

export function ActionModal({ open, onOpenChange, initial, clients, defaultClientId, onSaved }: Props) {
  const [form, setForm] = useState<ActionRow>({ ...EMPTY, ...(initial as ActionRow) });
  const [dueEdited, setDueEdited] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({ ...EMPTY, ...(defaultClientId ? { client: defaultClientId } : {}), ...(initial as ActionRow) });
      setDueEdited(!!initial?.due_date);
    }
  }, [open, initial, defaultClientId]);

  function set<K extends keyof ActionRow>(k: K, v: ActionRow[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  // auto-compute due when start/waiting change (unless manually edited)
  useEffect(() => {
    if (dueEdited) return;
    const d = autoDue(form.start_date, form.waiting_period);
    if (d !== form.due_date) setForm((f) => ({ ...f, due_date: d }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.start_date, form.waiting_period]);

  async function save() {
    if (!form.client) { toast.error("Client required"); return; }
    if (!form.action_description.trim()) { toast.error("Description required"); return; }
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const payload = { ...form, created_by: form.id ? undefined : u.user?.id } as never;
      if (form.id) {
        const { error } = await supabase.from("actions").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("actions").insert(payload);
        if (error) throw error;
      }
      toast.success(form.id ? "Action updated" : "Action created");
      onSaved?.();
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{form.id ? "Edit action" : "New action"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <F label="Client *">
            <Select value={form.client || undefined} onValueChange={(v) => set("client", v)}>
              <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
              <SelectContent>
                {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </F>
          <F label="Description *">
            <Textarea rows={2} value={form.action_description}
              onChange={(e) => set("action_description", e.target.value)} />
          </F>
          <div className="grid grid-cols-2 gap-3">
            <F label="Start date">
              <Input type="date" value={form.start_date ?? ""}
                onChange={(e) => set("start_date", e.target.value || null)} />
            </F>
            <F label="Waiting period">
              <Select value={form.waiting_period} onValueChange={(v) => set("waiting_period", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WAITING_PERIODS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </F>
            <F label={`Due date${dueEdited ? "" : " (auto)"}`}>
              <Input type="date" value={form.due_date ?? ""}
                onChange={(e) => { setDueEdited(true); set("due_date", e.target.value || null); }} />
            </F>
            <F label="Status">
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACTION_STATUSES.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </F>
          </div>
          {form.status === "Completed" && (
            <F label="Result">
              <Textarea rows={2} value={form.result ?? ""} onChange={(e) => set("result", e.target.value)} />
            </F>
          )}
          <F label="Notes">
            <Textarea rows={2} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
          </F>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
