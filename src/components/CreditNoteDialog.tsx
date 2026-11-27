import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useServerFn } from "@tanstack/react-start";
import { createCreditNote } from "@/lib/credit-note.functions";
import { formatInvoiceNumber } from "@/lib/invoice-code";
import { brusselsToday } from "@/lib/invoice-schedule";
import { formatEURCents, validateCreditAmount } from "@/lib/credit-note";
import { toast } from "sonner";

export type CreditTargetInvoice = {
  id: string;
  invoice_number: number;
  client_name?: string | null;
  total: number;
  repeat_monthly?: boolean;
};

const DEFAULT_REASON = "Volledige terugbetaling van de vooruitbetaling";

export function CreditNoteDialog({
  invoice,
  hasEmail,
  onClose,
  onCreated,
}: {
  invoice: CreditTargetInvoice | null;
  hasEmail: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState(DEFAULT_REASON);
  const [date, setDate] = useState(brusselsToday());
  const [stopRepeat, setStopRepeat] = useState(false);
  const [busy, setBusy] = useState<"create" | "send" | null>(null);
  const createFn = useServerFn(createCreditNote);

  useEffect(() => {
    if (!invoice) return;
    setAmount(String(Number(invoice.total || 0)));
    setReason(DEFAULT_REASON);
    setDate(brusselsToday());
    setStopRepeat(!!invoice.repeat_monthly);
  }, [invoice]);

  async function submit(send: boolean) {
    if (!invoice) return;
    const num = Number(amount.replace(",", "."));
    const err = validateCreditAmount(num, Number(invoice.total || 0));
    if (err) {
      toast.error(err);
      return;
    }
    if (send && !hasEmail) {
      toast.error("Klant heeft geen e-mailadres");
      return;
    }
    setBusy(send ? "send" : "create");
    try {
      const res = await createFn({
        data: {
          invoiceId: invoice.id,
          amount: num,
          reason: reason.trim() || DEFAULT_REASON,
          date: date || brusselsToday(),
          stopRepeat,
          send,
        },
      });
      toast.success(
        res.sentTo
          ? `Creditnota ${res.creditNumber} aangemaakt en verstuurd naar ${res.sentTo}`
          : `Creditnota ${res.creditNumber} aangemaakt`,
      );
      onCreated();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Aanmaken mislukt");
    } finally {
      setBusy(null);
    }
  }

  const maxTotal = Number(invoice?.total || 0);

  return (
    <Dialog open={!!invoice} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Creditnota aanmaken{" "}
            {invoice ? `· ${formatInvoiceNumber(invoice.invoice_number)}` : ""}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="text-xs text-muted-foreground">
            Klant: <span className="text-foreground font-medium">{invoice?.client_name || "—"}</span>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cn-amount">Bedrag (€, max {formatEURCents(maxTotal)})</Label>
            <Input
              id="cn-amount"
              type="number"
              step="0.01"
              min="0.01"
              max={maxTotal}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cn-reason">Reden</Label>
            <Input
              id="cn-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={DEFAULT_REASON}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cn-date">Datum</Label>
            <Input id="cn-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          {invoice?.repeat_monthly && (
            <label className="flex items-center gap-2.5 text-sm cursor-pointer select-none">
              <Checkbox
                checked={stopRepeat}
                onCheckedChange={(v) => setStopRepeat(v === true)}
              />
              <span>Ook maandelijkse herhaling stoppen</span>
            </label>
          )}
        </div>
        <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose} disabled={!!busy}>
            Annuleren
          </Button>
          <Button variant="secondary" onClick={() => submit(false)} disabled={!!busy}>
            {busy === "create" ? "Aanmaken…" : "Aanmaken"}
          </Button>
          <Button onClick={() => submit(true)} disabled={!!busy}>
            {busy === "send" ? "Versturen…" : "Aanmaken & versturen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}