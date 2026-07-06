import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CLIENT_SECTORS } from "@/lib/constants";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved?: () => void;
};

const EMPTY = { name: "", sector: "Other", location: "", contact_phone: "" };

export function QuickAddProspect({ open, onOpenChange, onSaved }: Props) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  useEffect(() => { if (open) setForm(EMPTY); }, [open]);

  async function save(goToDetail: boolean) {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("clients")
        .insert({
          name: form.name.trim(),
          sector: form.sector,
          location: form.location.trim() || null,
          contact_phone: form.contact_phone.trim() || null,
          status: "Prospect",
          pipeline_stage: "Found",
          health: "Not set",
          created_by: u.user?.id ?? null,
        } as never)
        .select("id")
        .single();
      if (error) throw error;
      toast.success("Prospect added");
      onOpenChange(false);
      onSaved?.();
      if (goToDetail && data) navigate({ to: "/clients/$id", params: { id: (data as { id: string }).id } });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to add prospect");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>New prospect</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Business name *</Label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Sector</Label>
            <Select value={form.sector} onValueChange={(v) => setForm((f) => ({ ...f, sector: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CLIENT_SECTORS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>City</Label>
              <Input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input type="tel" placeholder="+32 …" value={form.contact_phone} onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))} />
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => save(false)} disabled={saving}>Save</Button>
          <Button onClick={() => save(true)} disabled={saving}>{saving ? "Saving…" : "Save & open"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
