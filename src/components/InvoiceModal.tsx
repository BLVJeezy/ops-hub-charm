import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { INVOICE_STATUSES } from "@/lib/constants";
import { formatCurrency, todayISO } from "@/lib/format";
import type { LineItem } from "@/lib/invoice-pdf";

type Client = { id: string; name: string; billing_address?: string | null; vat_number?: string | null };

export type InvoiceRow = {
  id?: string;
  invoice_number?: number | null;
  client?: string | null;
  client_name?: string | null;
  client_address?: string | null;
  client_vat_number?: string | null;
  date: string;
  line_items: LineItem[];
  vat_note?: string | null;
  total: number;
  status: string;
};

const EMPTY: InvoiceRow = {
  date: todayISO(),
  line_items: [{ description: "", qty: 1, unit_price: 0 }],
  vat_note: "BTW verlegd (reverse charge, art. 44 EU VAT Directive).",
  total: 0,
  status: "Draft",
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: Partial<InvoiceRow> & { id?: string };
  clients: Client[];
  onSaved?: () => void;
};

export function InvoiceModal({ open, onOpenChange, initial, clients, onSaved }: Props) {
  const [form, setForm] = useState<InvoiceRow>({ ...EMPTY, ...(initial as InvoiceRow) });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm({ ...EMPTY, ...(initial as InvoiceRow), line_items: (initial?.line_items as LineItem[]) ?? EMPTY.line_items });
  }, [open, initial]);

  const total = form.line_items.reduce((s, l) => s + Number(l.qty || 0) * Number(l.unit_price || 0), 0);

  function onClientChange(id: string) {
    const c = clients.find((x) => x.id === id);
    setForm((f) => ({
      ...f, client: id,
      client_name: c?.name ?? f.client_name,
      client_address: c?.billing_address ?? f.client_address,
      client_vat_number: c?.vat_number ?? f.client_vat_number,
    }));
  }

  function updateLine(i: number, patch: Partial<LineItem>) {
    setForm((f) => ({ ...f, line_items: f.line_items.map((l, idx) => idx === i ? { ...l, ...patch } : l) }));
  }
  function addLine() { setForm((f) => ({ ...f, line_items: [...f.line_items, { description: "", qty: 1, unit_price: 0 }] })); }
  function delLine(i: number) { setForm((f) => ({ ...f, line_items: f.line_items.filter((_, idx) => idx !== i) })); }

  async function save() {
    if (!form.client_name?.trim()) { toast.error("Client name is required"); return; }
    if (form.line_items.length === 0) { toast.error("Add at least one line item"); return; }
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const payload = {
        client: form.client ?? null,
        client_name: form.client_name,
        client_address: form.client_address,
        client_vat_number: form.client_vat_number,
        date: form.date,
        line_items: form.line_items,
        vat_note: form.vat_note,
        total,
        status: form.status,
        created_by: form.id ? undefined : u.user?.id,
      } as never;
      if (form.id) {
        const { error } = await supabase.from("invoices").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("invoices").insert(payload);
        if (error) throw error;
      }
      toast.success(form.id ? "Invoice updated" : "Invoice created");
      onSaved?.();
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {form.id ? `Edit invoice #${form.invoice_number ?? ""}` : "New invoice"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <F label="Client (optional link)">
            <Select value={form.client ?? undefined} onValueChange={onClientChange}>
              <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
              <SelectContent>
                {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </F>
          <F label="Date">
            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </F>
          <F label="Client name *">
            <Input value={form.client_name ?? ""} onChange={(e) => setForm({ ...form, client_name: e.target.value })} />
          </F>
          <F label="VAT number">
            <Input value={form.client_vat_number ?? ""} onChange={(e) => setForm({ ...form, client_vat_number: e.target.value })} />
          </F>
          <F label="Billing address" className="md:col-span-2">
            <Textarea rows={2} value={form.client_address ?? ""} onChange={(e) => setForm({ ...form, client_address: e.target.value })} />
          </F>

          <div className="md:col-span-2">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs text-muted-foreground">Line items</Label>
              <Button size="sm" variant="outline" onClick={addLine} className="gap-1"><Plus className="w-3 h-3" /> Add line</Button>
            </div>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left px-2 py-1.5">Description</th>
                    <th className="text-right px-2 py-1.5 w-16">Qty</th>
                    <th className="text-right px-2 py-1.5 w-24">Price</th>
                    <th className="text-right px-2 py-1.5 w-24">Total</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {form.line_items.map((l, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="p-1"><Input value={l.description} onChange={(e) => updateLine(i, { description: e.target.value })} /></td>
                      <td className="p-1"><Input type="number" value={l.qty} className="text-right" onChange={(e) => updateLine(i, { qty: Number(e.target.value) || 0 })} /></td>
                      <td className="p-1"><Input type="number" value={l.unit_price} className="text-right" onChange={(e) => updateLine(i, { unit_price: Number(e.target.value) || 0 })} /></td>
                      <td className="p-1 text-right pr-2 tabular-nums">{formatCurrency(Number(l.qty ?? 0) * Number(l.unit_price ?? 0))}</td>
                      <td className="p-1">
                        <button onClick={() => delLine(i)} className="p-1 text-muted-foreground hover:text-destructive" title="Remove">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border bg-muted/20">
                    <td colSpan={3} className="px-2 py-2 text-right font-semibold">Total</td>
                    <td className="px-2 py-2 text-right font-semibold tabular-nums">{formatCurrency(total)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <F label="VAT note" className="md:col-span-2">
            <Textarea rows={2} value={form.vat_note ?? ""} onChange={(e) => setForm({ ...form, vat_note: e.target.value })} />
          </F>
          <F label="Status">
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {INVOICE_STATUSES.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
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

function F({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
