import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  CLIENT_STATUSES, PIPELINE_STAGES, CLIENT_SECTORS, WRITEOFF_REASONS,
  HEALTH_STATUSES, BILLING_FREQUENCIES, SEO_PACKAGES,
} from "@/lib/constants";
import { autoFillYearly, autoFillMonthly } from "@/lib/fees";
import { todayISO } from "@/lib/format";

export type ClientRow = {
  id?: string;
  name: string;
  sector: string;
  location?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  billing_address?: string | null;
  vat_number?: string | null;
  status: string;
  pipeline_stage: string;
  writeoff_reason?: string | null;
  health: string;
  website_needed: boolean;
  website_billing_frequency: string;
  website_setup_fee?: number | null;
  website_monthly_fee?: number | null;
  website_yearly_fee?: number | null;
  seo_package: string;
  billing_frequency: string;
  monthly_fee?: number | null;
  yearly_fee?: number | null;
  setup_fee?: number | null;
  seo_start_date?: string | null;
  seo_end_date?: string | null;
  contract_start_date?: string | null;
  renewal_date?: string | null;
  next_followup_date?: string | null;
  notes?: string | null;
};

const EMPTY: ClientRow = {
  name: "", sector: "Other", location: "", contact_name: "", contact_phone: "", contact_email: "",
  billing_address: "", vat_number: "",
  status: "Prospect", pipeline_stage: "Found", writeoff_reason: null, health: "Not set",
  website_needed: false, website_billing_frequency: "Monthly",
  website_setup_fee: null, website_monthly_fee: null, website_yearly_fee: null,
  seo_package: "None", billing_frequency: "Monthly",
  monthly_fee: null, yearly_fee: null, setup_fee: null,
  seo_start_date: null, seo_end_date: null, contract_start_date: null,
  renewal_date: null, next_followup_date: null, notes: "",
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: Partial<ClientRow> & { id?: string };
  onSaved?: (id: string) => void;
};

function num(v: string): number | null {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

export function ClientModal({ open, onOpenChange, initial, onSaved }: Props) {
  const [form, setForm] = useState<ClientRow>({ ...EMPTY, ...(initial as ClientRow) });
  const [prevStatus, setPrevStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({ ...EMPTY, ...(initial as ClientRow) });
      setPrevStatus(initial?.status ?? null);
    }
  }, [open, initial]);

  function set<K extends keyof ClientRow>(k: K, v: ClientRow[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    if (form.status === "Write-off" && !form.writeoff_reason) {
      toast.error("Write-off reason is required"); return;
    }
    // Sync stage ↔ status
    let stage = form.pipeline_stage;
    if (form.status === "Active" && stage !== "Converted") stage = "Converted";
    if (form.status === "Write-off") stage = "Write-off";
    if (form.status === "Prospect" && (stage === "Converted" || stage === "Write-off")) stage = "Found";

    setSaving(true);
    const payload = { ...form, pipeline_stage: stage };
    try {
      let id = form.id;
      if (id) {
        const { error } = await supabase.from("clients").update(payload).eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("clients").insert(payload).select("id").single();
        if (error) throw error;
        id = data.id;
      }
      // Status change log
      if (id && prevStatus !== form.status) {
        const { data: u } = await supabase.auth.getUser();
        await supabase.from("client_status_log").insert({
          client: id,
          from_status: prevStatus,
          to_status: form.status,
          date: todayISO(),
          created_by: u.user?.id ?? null,
        });
      }
      toast.success(form.id ? "Client updated" : "Client created");
      onSaved?.(id!);
      onOpenChange(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{form.id ? "Edit client" : "New client"}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Name *">
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="Sector">
            <SelectBox value={form.sector} onChange={(v) => set("sector", v)} options={CLIENT_SECTORS as unknown as string[]} />
          </Field>
          <Field label="Location">
            <Input value={form.location ?? ""} onChange={(e) => set("location", e.target.value)} />
          </Field>
          <Field label="Health">
            <SelectBox value={form.health} onChange={(v) => set("health", v)} options={HEALTH_STATUSES as unknown as string[]} />
          </Field>

          <Field label="Contact name">
            <Input value={form.contact_name ?? ""} onChange={(e) => set("contact_name", e.target.value)} />
          </Field>
          <Field label="Contact phone">
            <Input value={form.contact_phone ?? ""} onChange={(e) => set("contact_phone", e.target.value)} />
          </Field>
          <Field label="Contact email">
            <Input type="email" value={form.contact_email ?? ""} onChange={(e) => set("contact_email", e.target.value)} />
          </Field>
          <Field label="VAT number">
            <Input value={form.vat_number ?? ""} onChange={(e) => set("vat_number", e.target.value)} />
          </Field>
          <Field label="Billing address" className="md:col-span-2">
            <Textarea rows={2} value={form.billing_address ?? ""} onChange={(e) => set("billing_address", e.target.value)} />
          </Field>

          <Field label="Status">
            <SelectBox value={form.status} onChange={(v) => set("status", v)} options={CLIENT_STATUSES as unknown as string[]} />
          </Field>
          <Field label="Pipeline stage">
            <SelectBox value={form.pipeline_stage} onChange={(v) => set("pipeline_stage", v)} options={PIPELINE_STAGES as unknown as string[]} />
          </Field>
          {form.status === "Write-off" && (
            <Field label="Write-off reason *" className="md:col-span-2">
              <SelectBox value={form.writeoff_reason ?? ""} onChange={(v) => set("writeoff_reason", v)} options={WRITEOFF_REASONS as unknown as string[]} />
            </Field>
          )}

          <div className="md:col-span-2 pt-2 border-t border-border" />

          <Field label="SEO package">
            <SelectBox value={form.seo_package} onChange={(v) => set("seo_package", v)} options={SEO_PACKAGES as unknown as string[]} />
          </Field>
          <Field label="SEO billing frequency">
            <SelectBox value={form.billing_frequency} onChange={(v) => set("billing_frequency", v)} options={BILLING_FREQUENCIES as unknown as string[]} />
          </Field>
          <Field label="Setup fee (€)">
            <Input type="number" value={form.setup_fee ?? ""} onChange={(e) => set("setup_fee", num(e.target.value))} />
          </Field>
          <Field label="Monthly fee (€)">
            <Input
              type="number" value={form.monthly_fee ?? ""}
              onChange={(e) => {
                const v = num(e.target.value);
                setForm((f) => ({ ...f, monthly_fee: v, yearly_fee: f.yearly_fee || autoFillYearly(v) }));
              }}
            />
          </Field>
          <Field label="Yearly fee (€)">
            <Input
              type="number" value={form.yearly_fee ?? ""}
              onChange={(e) => {
                const v = num(e.target.value);
                setForm((f) => ({ ...f, yearly_fee: v, monthly_fee: f.monthly_fee || autoFillMonthly(v) }));
              }}
            />
          </Field>
          <Field label="Contract start">
            <Input type="date" value={form.contract_start_date ?? ""} onChange={(e) => set("contract_start_date", e.target.value || null)} />
          </Field>
          <Field label="Renewal date">
            <Input type="date" value={form.renewal_date ?? ""} onChange={(e) => set("renewal_date", e.target.value || null)} />
          </Field>
          <Field label="SEO start">
            <Input type="date" value={form.seo_start_date ?? ""} onChange={(e) => set("seo_start_date", e.target.value || null)} />
          </Field>
          <Field label="SEO end">
            <Input type="date" value={form.seo_end_date ?? ""} onChange={(e) => set("seo_end_date", e.target.value || null)} />
          </Field>
          <Field label="Next follow-up">
            <Input type="date" value={form.next_followup_date ?? ""} onChange={(e) => set("next_followup_date", e.target.value || null)} />
          </Field>

          <div className="md:col-span-2 flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <div className="text-sm font-medium">Website needed</div>
              <div className="text-xs text-muted-foreground">Enable to add website fees</div>
            </div>
            <Switch checked={form.website_needed} onCheckedChange={(v) => set("website_needed", v)} />
          </div>

          {form.website_needed && (
            <>
              <Field label="Website billing frequency">
                <SelectBox value={form.website_billing_frequency} onChange={(v) => set("website_billing_frequency", v)} options={BILLING_FREQUENCIES as unknown as string[]} />
              </Field>
              <Field label="Website setup fee (€)">
                <Input type="number" value={form.website_setup_fee ?? ""} onChange={(e) => set("website_setup_fee", num(e.target.value))} />
              </Field>
              <Field label="Website monthly fee (€)">
                <Input
                  type="number" value={form.website_monthly_fee ?? ""}
                  onChange={(e) => {
                    const v = num(e.target.value);
                    setForm((f) => ({ ...f, website_monthly_fee: v, website_yearly_fee: f.website_yearly_fee || autoFillYearly(v) }));
                  }}
                />
              </Field>
              <Field label="Website yearly fee (€)">
                <Input
                  type="number" value={form.website_yearly_fee ?? ""}
                  onChange={(e) => {
                    const v = num(e.target.value);
                    setForm((f) => ({ ...f, website_yearly_fee: v, website_monthly_fee: f.website_monthly_fee || autoFillMonthly(v) }));
                  }}
                />
              </Field>
            </>
          )}

          <Field label="Notes" className="md:col-span-2">
            <Textarea rows={3} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function SelectBox({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>
        {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
