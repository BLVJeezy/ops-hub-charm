import { useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";
import { stopInvoiceRepeat } from "@/lib/credit-note.functions";
import { toast } from "sonner";

export function StopRepeatDialog({
  invoice,
  onClose,
  onStopped,
}: {
  invoice: { id: string; client_name?: string | null } | null;
  onClose: () => void;
  onStopped: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const stopFn = useServerFn(stopInvoiceRepeat);

  async function handleConfirm() {
    if (!invoice) return;
    setBusy(true);
    try {
      await stopFn({ data: { invoiceId: invoice.id } });
      toast.success("Maandelijkse herhaling gestopt");
      onStopped();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Stoppen mislukt");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={!!invoice} onOpenChange={(o) => !o && !busy && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Maandelijkse herhaling stoppen?</AlertDialogTitle>
          <AlertDialogDescription>
            Maandelijkse herhaling stoppen voor {invoice?.client_name || "deze klant"}? Er worden
            geen nieuwe facturen meer automatisch aangemaakt of verstuurd.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Annuleren
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={busy}>
            {busy ? "Stoppen…" : "Stoppen"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}