import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, FileText, Download, Pencil, Send, Bell, CheckCircle2, Trash2 } from "lucide-react";
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

function Invoices() {
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
      supabase.from("invoices").select("*").order("invoice_number", { ascending: false }),
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
    if (tab !== "All") list = list.filter((r) => r.status === tab);
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter((r) =>
        (r.client_name || "").toLowerCase().includes(s) ||
        String(r.invoice_number).includes(s),
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
    if (!confirm(`Delete invoice #${r.invoice_number ?? ""}? This cannot be undone.`)) return;
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

  const counts = { All: rows.length, Draft: rows.filter(r => r.status === "Draft").length, Sent: rows.filter(r => r.status === "Sent").length, Paid: rows.filter(r => r.status === "Paid").length };

  const statusColor: Record<string, string> = {
    Draft: "bg-muted text-muted-foreground",
    Sent: "bg-amber-500/15 text-amber-400",
    Paid: "bg-emerald-500/15 text-emerald-400",
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto pb-24">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 mb-4">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight truncate">Invoices</h1>
        {isAdmin && (
          <Button onClick={() => { setEditing(null); setModalOpen(true); }} className="gap-2 shrink-0 bg-white text-black hover:bg-white/90 rounded-full h-10 px-4">
            <Plus className="w-4 h-4" /> New Invoice
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
        <Stat label="Paid" value={formatCurrency(totals.paid)} />
        <Stat label="Outstanding" value={formatCurrency(totals.sent)} />
        <Stat label="Invoices" value={String(rows.length)} className="col-span-2 md:col-span-1" />
      </div>

      <div className="space-y-2 mb-4">
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="w-full grid grid-cols-4">
            {(["All", "Draft", "Sent", "Paid"] as const).map((t) => (
              <TabsTrigger key={t} value={t} className="text-xs">
                {t} <span className="ml-1 opacity-60">{counts[t]}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="w-full" />
      </div>

      {loading ? (
        <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={FileText} title="No invoices" description="Create one to get started." />
      ) : (
        <ul className="space-y-2">
          {filtered.map((r) => (
            <li key={r.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-mono">#{r.invoice_number}</span>
                    <span>·</span>
                    <span>{formatDate(r.date)}</span>
                  </div>
                  <div className="font-semibold truncate mt-0.5">{r.client_name}</div>
                  <div className="text-lg font-bold mt-1 tabular-nums">{formatCurrency(Number(r.total || 0))}</div>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  {isAdmin ? (
                    <select
                      value={r.status}
                      onChange={(e) => markStatus(r, e.target.value)}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium border-0 ${statusColor[r.status] ?? "bg-muted"}`}
                    >
                      {["Draft", "Sent", "Paid"].map((s) => <option key={s} value={s} className="bg-card text-foreground">{s}</option>)}
                    </select>
                  ) : (
                    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${statusColor[r.status] ?? "bg-muted"}`}>{r.status}</span>
                  )}
                  <div className="flex gap-1">
                    {isAdmin && r.status !== "Paid" && (
                      <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => sendInvoiceEmail(r)} title="Verstuur factuur per e-mail">
                        <Send className="w-3.5 h-3.5" /> {r.sent_at ? "Opnieuw" : "Verstuur"}
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => downloadPdf(r)} title="Download PDF">
                      <Download className="w-4 h-4" />
                    </Button>
                    {isAdmin && (
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setEditing(r); setModalOpen(true); }} title="Edit">
                        <Pencil className="w-4 h-4" />
                      </Button>
                    )}
                    {isAdmin && (
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => deleteInvoiceRow(r)} title="Delete">
                        <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
              {(r.sent_at || (r.reminder_count ?? 0) > 0 || r.email_status) && (
                <div className="mt-3 pt-3 border-t border-border flex flex-wrap gap-3 text-xs text-muted-foreground">
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

function Stat({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className={`rounded-2xl border border-border bg-card p-3 ${className}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}
