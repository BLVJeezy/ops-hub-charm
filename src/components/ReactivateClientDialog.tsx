import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { todayISO } from "@/lib/format";
import { SERVICE_LABELS, type OffboardService } from "@/lib/offboarding";
import { reactivateClientFn } from "@/lib/offboarding.functions";

export function ReactivateClientDialog({
  client,
  open,
  onOpenChange,
  onCompleted,
}: {
  client: { id: string; name: string; social_end_date?: string | null; seo_end_date?: string | null };
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCompleted: () => void;
}) {
  const reactivateFn = useServerFn(reactivateClientFn);
  const [selected, setSelected] = useState<OffboardService[]>([]);
  const [saving, setSaving] = useState(false);

  const endedServices: OffboardService[] = [
    ...(client.social_end_date ? (["social"] as const) : []),
    ...(client.seo_end_date ? (["seo"] as const) : []),
  ];

  useEffect(() => {
    if (open) setSelected(endedServices);
  }, [open, client.id]);

  function toggle(s: OffboardService) {
    setSelected((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  async function submit() {
    setSaving(true);
    try {
      await reactivateFn({ data: { clientId: client.id, services: selected, date: todayISO() } });
      toast.success(`${client.name} opnieuw geactiveerd.`);
      onOpenChange(false);
      onCompleted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Heractiveren mislukt");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Klant heractiveren</DialogTitle>
          <DialogDescription>
            Zet {client.name} terug op Active. Bestaande creditnota&apos;s worden niet ongedaan gemaakt.
          </DialogDescription>
        </DialogHeader>

        {endedServices.length > 0 && (
          <div className="space-y-2 text-sm">
            <div className="text-xs text-muted-foreground">Einddatum wissen voor:</div>
            {endedServices.map((s) => (
              <label key={s} className="flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.includes(s)}
                  onChange={() => toggle(s)}
                  className="rounded border-border accent-primary"
                />
                <span>{SERVICE_LABELS[s]}</span>
              </label>
            ))}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Annuleren
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Bezig…" : "Heractiveren"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}