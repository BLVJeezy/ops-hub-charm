import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { formatCurrency, formatDate, todayISO } from "@/lib/format";
import { formatInvoiceNumber } from "@/lib/invoice-code";
import {
  buildOffboardPreviewSummary,
  detectClientServices,
  SERVICE_LABELS,
  willPauseClient,
  type OffboardContext,
  type OffboardService,
} from "@/lib/offboarding";
import { getOffboardContext, runClientOffboarding } from "@/lib/offboarding.functions";

export function OffboardClientDialog({
  clientId,
  clientName,
  open,
  onOpenChange,
  onCompleted,
}: {
  clientId: string;
  clientName: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCompleted: () => void;
}) {
  const loadCtxFn = useServerFn(getOffboardContext);
  const runFn = useServerFn(runClientOffboarding);

  const [ctx, setCtx] = useState<OffboardContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [endDate, setEndDate] = useState(todayISO());
  const [reason, setReason] = useState("");
  const [selectedServices, setSelectedServices] = useState<OffboardService[]>([]);
  const [allSelected, setAllSelected] = useState(true);
  const [checkedInvoices, setCheckedInvoices] = useState<Record<string, boolean>>({});
  const [invoiceAmounts, setInvoiceAmounts] = useState<Record<string, string>>({});
  const [sendCreditNotes, setSendCreditNotes] = useState(false);
  const [stopInvoices, setStopInvoices] = useState(true);
  const [stopTasks, setStopTasks] = useState(true);
  const [endAgreements, setEndAgreements] = useState(true);
  const [pauseClient, setPauseClient] = useState(true);
  const [closeVideos, setCloseVideos] = useState(true);

  useEffect(() => {
    if (!open) return;
    const today = todayISO();
    setEndDate(today);
    setReason("");
    setCheckedInvoices({});
    setSendCreditNotes(false);
    setStopInvoices(true);
    setStopTasks(true);
    setEndAgreements(true);
    setPauseClient(true);
    setCloseVideos(true);
    setLoading(true);

    loadCtxFn({ data: { clientId } })
      .then((res) => {
        setCtx(res);
        const { available, active } = detectClientServices(res.client, today);
        const initial = active.length > 0 ? active : available;
        setSelectedServices(initial);
        setAllSelected(true);
        const amounts: Record<string, string> = {};
        for (const inv of res.invoices) amounts[inv.id] = String(inv.total);
        setInvoiceAmounts(amounts);
      })
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : "Kon gegevens niet laden");
        onOpenChange(false);
      })
      .finally(() => setLoading(false));
  }, [open, clientId]);

  const availableServices = useMemo(
    () => (ctx ? detectClientServices(ctx.client, endDate).available : []),
    [ctx, endDate],
  );

  const selectedCreditNotes = useMemo(() => {
    if (!ctx) return [];
    return ctx.invoices
      .filter((inv) => checkedInvoices[inv.id])
      .map((inv) => ({
        invoice_id: inv.id,
        total: inv.total,
        amount: Number(String(invoiceAmounts[inv.id] ?? inv.total).replace(",", ".")),
      }));
  }, [ctx, checkedInvoices, invoiceAmounts]);

  const futureOpenTasksCount = useMemo(
    () => (ctx ? ctx.openTasks.filter((t) => t.due_date && t.due_date > endDate).length : 0),
    [ctx, endDate],
  );

  const endMonth = endDate ? `${endDate.slice(0, 7)}-01` : "";
  const affectedVideosCount = useMemo(
    () => (ctx && endMonth ? ctx.unfinishedVideos.filter((v) => v.month >= endMonth).length : 0),
    [ctx, endMonth],
  );

  const willPause = useMemo(
    () => (ctx ? willPauseClient(ctx.client, selectedServices, allSelected, pauseClient, endDate) : false),
    [ctx, selectedServices, allSelected, pauseClient, endDate],
  );

  const summary = useMemo(() => {
    if (!ctx) return "";
    return buildOffboardPreviewSummary({
      stopInvoices,
      repeatingCount: ctx.repeatingCount,
      creditNotes: selectedCreditNotes,
      stopTasks,
      activeRecurringTasksCount: ctx.activeRecurringTasksCount,
      futureOpenTasksCount,
      endAgreements,
      agreementRefs: ctx.activeAgreements.map((a) => a.reference),
      closeVideos,
      videosCount: affectedVideosCount,
      willPause,
    });
  }, [
    ctx,
    stopInvoices,
    selectedCreditNotes,
    stopTasks,
    futureOpenTasksCount,
    endAgreements,
    closeVideos,
    affectedVideosCount,
    willPause,
  ]);

  function toggleService(s: OffboardService) {
    setSelectedServices((prev) => {
      const next = prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s];
      setAllSelected(availableServices.length > 0 && availableServices.every((a) => next.includes(a)));
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setAllSelected(checked);
    setSelectedServices(checked ? [...availableServices] : []);
  }

  async function submit() {
    if (!ctx) return;
    if (!endDate) {
      toast.error("Kies een einddatum.");
      return;
    }
    for (const cn of selectedCreditNotes) {
      if (!Number.isFinite(cn.amount) || cn.amount <= 0 || cn.amount > cn.total) {
        toast.error(`Ongeldig creditbedrag (max ${formatCurrency(cn.total)}).`);
        return;
      }
    }

    setSaving(true);
    try {
      const res = await runFn({
        data: {
          clientId,
          services: selectedServices,
          all: allSelected,
          endDate,
          reason,
          creditNotes: selectedCreditNotes.map((c) => ({ invoice_id: c.invoice_id, amount: c.amount })),
          sendCreditNotes,
          stopInvoices,
          stopTasks,
          endAgreements,
          pauseClient,
          closeVideos,
        },
      });
      if (res.mailErrors.length > 0) {
        toast.warning(`Stopgezet, maar mail mislukt: ${res.mailErrors.join("; ")}`);
      } else {
        toast.success(`Samenwerking met ${clientName} stopgezet.`);
      }
      onOpenChange(false);
      onCompleted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Stopzetten mislukt");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Samenwerking stopzetten</DialogTitle>
          <DialogDescription>{clientName}</DialogDescription>
        </DialogHeader>

        {loading || !ctx ? (
          <div className="py-6 text-sm text-muted-foreground">Gegevens laden…</div>
        ) : (
          <div className="space-y-4 text-sm">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Welke dienst stopt?</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {availableServices.map((s) => (
                  <label key={s} className="flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedServices.includes(s)}
                      onChange={() => toggleService(s)}
                      className="rounded border-border accent-primary"
                    />
                    <span>{SERVICE_LABELS[s]}</span>
                  </label>
                ))}
                <label className="flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) => toggleAll(e.target.checked)}
                    className="rounded border-border accent-primary"
                  />
                  <span className="font-medium">Alles</span>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="offboard-date">Einddatum</Label>
                <Input id="offboard-date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="offboard-reason">Reden (optioneel)</Label>
                <Input
                  id="offboard-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="bv. Budget / pauze"
                />
              </div>
            </div>

            {ctx.invoices.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Creditnota?</Label>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {ctx.invoices.map((inv) => {
                    const checked = !!checkedInvoices[inv.id];
                    return (
                      <div key={inv.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-2">
                        <label className="flex items-center gap-2 cursor-pointer min-w-0">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => setCheckedInvoices((p) => ({ ...p, [inv.id]: e.target.checked }))}
                            className="rounded border-border accent-primary"
                          />
                          <span className="font-medium">{formatInvoiceNumber(inv.invoice_number)}</span>
                          <span className="text-xs text-muted-foreground">{formatDate(inv.date)}</span>
                          <span className="text-xs text-muted-foreground">· {inv.status}</span>
                        </label>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-muted-foreground">€</span>
                          <Input
                            type="number"
                            step="0.01"
                            min="0.01"
                            max={inv.total}
                            disabled={!checked}
                            value={invoiceAmounts[inv.id] ?? String(inv.total)}
                            onChange={(e) => setInvoiceAmounts((p) => ({ ...p, [inv.id]: e.target.value }))}
                            className="h-8 w-24 text-right tabular-nums"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                {selectedCreditNotes.length > 0 && (
                  <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={sendCreditNotes}
                      onChange={(e) => setSendCreditNotes(e.target.checked)}
                      className="rounded border-border accent-primary"
                    />
                    Creditnota&apos;s meteen versturen per e-mail
                  </label>
                )}
              </div>
            )}

            <div className="space-y-1.5 border-t border-border pt-3">
              <CheckRow
                checked={stopInvoices}
                onChange={setStopInvoices}
                label={`Maandelijkse facturen stoppen (${ctx.repeatingCount})`}
              />
              <CheckRow
                checked={stopTasks}
                onChange={setStopTasks}
                label={`Taken stoppen (${ctx.activeRecurringTasksCount + futureOpenTasksCount})`}
              />
              <CheckRow
                checked={endAgreements}
                onChange={setEndAgreements}
                label={`Overeenkomst(en) beëindigen (${ctx.activeAgreements.length})`}
              />
              <CheckRow
                checked={pauseClient}
                onChange={setPauseClient}
                label={willPause ? "Klantstatus op Paused zetten" : "Klantstatus op Paused zetten (blijft Active door andere diensten)"}
              />
              <CheckRow
                checked={closeVideos}
                onChange={setCloseVideos}
                label={`Video-projecten afsluiten (${affectedVideosCount})`}
              />
            </div>

            <div className="rounded-lg border border-border bg-secondary/50 px-3 py-2.5 text-xs text-foreground">
              <div className="text-muted-foreground mb-0.5">Samenvatting</div>
              <div>{summary}</div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Annuleren
          </Button>
          <Button variant="destructive" onClick={submit} disabled={loading || !ctx || saving}>
            {saving ? "Bezig…" : "Stopzetten"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CheckRow({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2.5 py-1 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded border-border accent-primary"
      />
      <span>{label}</span>
    </label>
  );
}