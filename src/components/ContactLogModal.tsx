import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CONTACT_CHANNELS, CONTACT_DIRECTIONS } from "@/lib/constants";
import { todayISO } from "@/lib/format";

type Props = {
  clientId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved?: () => void;
};

export function ContactLogModal({ clientId, open, onOpenChange, onSaved }: Props) {
  const [date, setDate] = useState(todayISO());
  const [channel, setChannel] = useState<string>("WhatsApp");
  const [direction, setDirection] = useState<string>("Outreach");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!note.trim()) { toast.error("Note required"); return; }
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("contact_log").insert({
        client: clientId, date, channel, direction, note, created_by: u.user?.id ?? null,
      });
      if (error) throw error;
      toast.success("Contact logged");
      setNote(""); setDate(todayISO()); setChannel("WhatsApp"); setDirection("Outreach");
      onSaved?.();
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Log contact</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Direction</Label>
              <Select value={direction} onValueChange={setDirection}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONTACT_DIRECTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Channel</Label>
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CONTACT_CHANNELS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Note</Label>
            <Textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
