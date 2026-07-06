import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { EXPENSE_CATEGORIES } from "@/lib/constants";

export type ExpenseRow = {
  id?: string;
  name: string;
  category: string;
  monthly_cost: number;
  linked_client?: string | null;
  notes?: string | null;
};

const EMPTY: ExpenseRow = { name: "", category: "Tool", monthly_cost: 0, linked_client: null, notes: "" };

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: Partial<ExpenseRow> & { id?: string };
  clients: { id: string; name: string }[];
  onSaved?: () => void;
};

export function ExpenseModal({ open, onOpenChange, initial, clients, onSaved }: Props) {
  const [form, setForm] = useState<ExpenseRow>({ ...EMPTY, ...(initial as ExpenseRow) });
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) setForm({ ...EMPTY, ...(initial as ExpenseRow) }); }, [open, initial]);

  async function save() {
    if (!form.name.trim()) { toast.error("Name required"); return; }
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const payload = { ...form, created_by: form.id ? undefined : u.user?.id } as never;
      if (form.id) {
        const { error } = await supabase.from("expenses").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("expenses").insert(payload);
        if (error) throw error;
      }
      toast.success(form.id ? "Expense updated" : "Expense created");
      onSaved?.();
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{form.id ? "Edit expense" : "New expense"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <F label="Name *"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></F>
          <div className="grid grid-cols-2 gap-3">
            <F label="Category">
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </F>
            <F label="Monthly cost (€)">
              <Input type="number" value={form.monthly_cost}
                onChange={(e) => setForm({ ...form, monthly_cost: Number(e.target.value) || 0 })} />
            </F>
          </div>
          <F label="Linked client (optional)">
            <Select value={form.linked_client ?? "none"} onValueChange={(v) => setForm({ ...form, linked_client: v === "none" ? null : v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Business-wide —</SelectItem>
                {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </F>
          <F label="Notes"><Textarea rows={2} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></F>
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
