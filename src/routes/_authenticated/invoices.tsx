import { useCurrency } from "@/components/CurrencyToggle";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, FileText, Download, Pencil, Send, Bell, CheckCircle2, Trash2, CalendarClock, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState } from "@/components/EmptyState";
import { InvoiceModal, type InvoiceRow } from "@/components/InvoiceModal";
import { formatCurrency, formatDate } from "@/lib/format";
import { downloadInvoicePDF, type LineItem } from "@/lib/invoice-pdf";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useServerFn } from "@tanstack/react-start";
import { sendInvoiceMail } from "@/lib/invoice-send.functions";
import { formatInvoiceNumber } from "@/lib/invoice-code";
import { hourLabel } from "@/lib/invoice-schedule";

export const Route = createFileRoute("/_authenticated/invoices")({
  component: Invoices,
});

type Row = InvoiceRow & {
  id: string;
  invoice_number: number;
  sent_at?: string | null;
  last_reminder_at?: string | null;
  reminder_count?: number | null;
  email_status?: string | null;
  delivered_at?: string | null;
  opened_at?: string | null;
  bounced_at?: string | null;
};
type Client = { id: string; name: string; billing_address?: string | null; vat_number?: string | null; contact_email?: string | null };

function isPlanned(r: { status: string; scheduled_send_at?: string | null; repeat_monthly?: boolean }) {
  return (r.status === "Draft" && !!r.scheduled_send_at) || !!r.repeat_monthly;
}

function Invoices() {
  useCurrency();
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [rows, setRows] = useState<Row[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("All");
  const [q, setQ] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);

  async function load() {
    setLoading(true);
    const [i, c] = await Promise.all([
      supabase.from("invoices").select("*").order("created_at", { ascending: false }),
      supabase.from("clients").select("id,name,billing_address,vat_number,contact_email").order("name"),
    ]);
    if (i.error) toast.error(i.error.message);
    setRows((i.data as unknown as Row[]) ?? []);
    setClients((c.data as unknown as Client[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const ch = supabase.channel("invoices-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const filtered = useMemo(() => {
    let list = rows;
    if (tab === "Gepland") list = list.filter(isPlanned);
    else if (tab !== "All") list = list.filter((r) => r.status === tab);
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter((r) =>
        (r.client_name || "").toLowerCase().includes(s) ||
        formatInvoiceNumber(r.invoice_number).toLowerCase().includes(s),
      );
    }
    return list;
  }, [rows, tab, q]);

  const totals = useMemo(() => {
    const paid = rows.filter((r) => r.status === "Paid").reduce((s, r) => s + Number(r.total || 0), 0);
    const sent = rows.filter((r) => r.status === "Sent").reduce((s, r) => s + Number(r.total || 0), 0);
    return { paid, sent };
  }, [rows]);

  async function markStatus(r: Row, status: string) {
    const { error } = await supabase.from("invoices").update({ status } as never).eq("id", r.id);
    if (error) toast.error(error.message);
  }

  function downloadPdf(r: Row) {
    downloadInvoicePDF({
      invoice_number: r.invoice_number,
      date: r.date,
      client_name: r.client_name || "",
      client_address: r.client_address,
      client_vat_number: r.client_vat_number,
      line_items: r.line_items as LineItem[],
      vat_note: r.vat_note,
      total: Number(r.total || 0),
    });
  }

  const sendMailFn = useServerFn(sendInvoiceMail);

  async function deleteInvoiceRow(r: Row) {
    if (!confirm(`Delete invoice ${formatInvoiceNumber(r.invoice_number)}? This cannot be undone.`)) return;
    const { error } = await supabase.from("invoices").delete().eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Invoice deleted");
    load();
  }

  async function sendInvoiceEmail(r: Row) {
    const client = clients.find((c) => c.id === r.client);
    const email = client?.contact_email?.trim();
    if (!email) { toast.error("Klant heeft geen e-mailadres"); return; }
    const t = toast.loading(`Versturen naar ${email}…`);
    try {
      await sendMailFn({ data: { invoiceId: r.id, isReminder: false } });
      toast.success(`Factuur verstuurd naar ${email}`, { id: t });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Versturen mislukt", { id: t });
    }
  }

  const counts = { All: rows.length, Draft: rows.filter(r => r.status === "Draft").length, Sent: rows.filter(r => r.status === "Sent").length, Paid: rows.filter(r => r.status === "Paid").length, Gepland: rows.filter(isPlanned).length };

  const statusColor: Record<string, string> = {
    Draft: "bg-muted text-muted-foreground",
    Sent: "bg-amber-500/15 text-amber-400",
    Paid: "bg-emerald-500/15 text-emerald-400",
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto pb-24">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 mb-3">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight truncate">Invoices</h1>
        {isAdmin && (
          <Button onClick={() => { setEditing(null); setModalOpen(true); }} className="gap-2 shrink-0 bg-white text-black hover:bg-white/90 rounded-full h-10 px-4">
            <Plus className="w-4 h-4" /> New Invoice
          </Button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <Stat label="Paid" value={formatCurrency(totals.paid)} className="tone tone-emerald" ink="ink-emerald" />
        <Stat label="Outstanding" value={formatCurrency(totals.sent)} className={totals.sent > 0 ? "tone tone-amber" : ""} />
        <Stat label="Scheduled" value={String(counts.Gepland)} className={counts.Gepland > 0 ? "tone tone-sky" : ""} />
      </div>

      <div className="space-y-2 mb-3">
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="w-full grid grid-cols-5">
            {(["All", "Draft", "Gepland", "Sent", "Paid"] as const).map((t) => (
              <TabsTrigger key={t} value={t} className="text-xs">
                {t} <span className="ml-1 opacity-60">{counts[t]}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="w-full h-9" />
      </div>

      {loading ? (
        <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={FileText} title="No invoices" description="Create one to get started." />
      ) : (
        <ul className="space-y-2">
          {filtered.map((r) => (
            <li key={r.id} className="rounded-xl border border-border bg-card px-3.5 py-3">
              <div className="flex items-center gap-2">
                <div className="font-semibold truncate min-w-0 flex-1">{r.client_name}</div>
                {isAdmin ? (
                  <select
                    value={r.status}
                    onChange={(e) => markStatus(r, e.target.value)}
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium border-0 ${statusColor[r.status] ?? "bg-muted"}`}
                  >
                    {["Draft", "Sent", "Paid"].map((s) => <option key={s} value={s} className="bg-card text-foreground">{s}</option>)}
                  </select>
                ) : (
                  <span className={`shrink-0 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${statusColor[r.status] ?? "bg-muted"}`}>{r.status}</span>
                )}
                <div className="shrink-0 text-base font-bold tabular-nums w-[4.5rem] text-right">{formatCurrency(Number(r.total || 0))}</div>
              </div>
              <div className="flex items-center justify-between gap-2 mt-1">
                <div className="text-xs text-muted-foreground truncate">
                  <span className="font-mono">{formatInvoiceNumber(r.invoice_number)}</span> · {formatDate(r.date)}
                </div>
                <div className="flex shrink-0 -mr-1.5">
                  {isAdmin && r.status !== "Paid" && (
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => sendInvoiceEmail(r)} title={r.sent_at ? "Opnieuw versturen" : "Verstuur factuur per e-mail"}>
                      <Send className="w-3.5 h-3.5 text-sky-400" />
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => downloadPdf(r)} title="Download PDF">
                    <Download className="w-3.5 h-3.5" />
                  </Button>
                  {isAdmin && (
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditing(r); setModalOpen(true); }} title="Edit">
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                  )}
                  {isAdmin && (
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteInvoiceRow(r)} title="Delete">
                      <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
              {(r.sent_at || (r.reminder_count ?? 0) > 0 || r.email_status || isPlanned(r) || r.schedule_error) && (
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                  {r.status === "Draft" && r.scheduled_send_at && (
                    <span className="inline-flex items-center gap-1 text-sky-400">
                      <CalendarClock className="w-3.5 h-3.5" /> Gepland {formatDate(r.scheduled_send_at)} {hourLabel(r.scheduled_send_hour)}
                    </span>
                  )}
                  {r.repeat_monthly && (
                    <span className="inline-flex items-center gap-1 text-violet-400">
                      <Repeat className="w-3.5 h-3.5" /> Maandelijks
                      {r.status === "Draft" && r.scheduled_send_at ? "" : r.next_repeat_on ? ` · volgende ${formatDate(r.next_repeat_on)} ${hourLabel(r.repeat_hour)}` : r.repeat_day ? ` · dag ${r.repeat_day}, ${hourLabel(r.repeat_hour)}` : ""}
                    </span>
                  )}
                  {r.schedule_error && (
                    <span className="inline-flex items-center gap-1 text-red-400" title={r.schedule_error}>
                      ⚠ Automatisch versturen mislukt
                    </span>
                  )}
                  {r.sent_at && (
                    <span className="inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      Verstuurd {formatDate(r.sent_at)}
                    </span>
                  )}
                  {r.delivered_at && (
                    <span className="inline-flex items-center gap-1 text-emerald-400">
                      ✓ Afgeleverd {formatDate(r.delivered_at)}
                    </span>
                  )}
                  {r.opened_at && (
                    <span className="inline-flex items-center gap-1 text-sky-400">
                      👁 Geopend {formatDate(r.opened_at)}
                    </span>
                  )}
                  {r.bounced_at && (
                    <span className="inline-flex items-center gap-1 text-red-400">
                      ⚠ Bounced {formatDate(r.bounced_at)}
                    </span>
                  )}
                  {(r.reminder_count ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Bell className="w-3.5 h-3.5 text-amber-400" />
                      {r.reminder_count} herinnering{(r.reminder_count ?? 0) > 1 ? "en" : ""}
                      {r.last_reminder_at && ` · laatst ${formatDate(r.last_reminder_at)}`}
                    </span>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <InvoiceModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        initial={editing ?? undefined}
        clients={clients}
        onSaved={() => load()}
      />
    </div>
  );
}

function Stat({ label, value, className = "", ink = "" }: { label: string; value: string; className?: string; ink?: string }) {
  return (
    <div className={`rounded-xl border bg-card px-3 py-2.5 ${className || "border-border"}`}>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-lg font-bold tabular-nums ${ink}`}>{value}</div>
    </div>
  );
}
