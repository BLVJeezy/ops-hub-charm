import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, FileText, Download, Pencil } from "lucide-react";
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

export const Route = createFileRoute("/_authenticated/invoices")({
  component: Invoices,
});

type Row = InvoiceRow & { id: string; invoice_number: number };
type Client = { id: string; name: string; billing_address?: string | null; vat_number?: string | null };

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
      supabase.from("clients").select("id,name,billing_address,vat_number").order("name"),
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

  const counts = { All: rows.length, Draft: rows.filter(r => r.status === "Draft").length, Sent: rows.filter(r => r.status === "Sent").length, Paid: rows.filter(r => r.status === "Paid").length };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold">Invoices</h1>
        {isAdmin && (
          <Button onClick={() => { setEditing(null); setModalOpen(true); }} className="gap-2">
            <Plus className="w-4 h-4" /> New invoice
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <Stat label="Paid (all-time)" value={formatCurrency(totals.paid)} />
        <Stat label="Outstanding (Sent)" value={formatCurrency(totals.sent)} />
        <Stat label="Invoices" value={String(rows.length)} />
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            {(["All", "Draft", "Sent", "Paid"] as const).map((t) => (
              <TabsTrigger key={t} value={t}>
                {t} <span className="ml-1.5 text-xs opacity-60">{counts[t]}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="flex-1 min-w-[200px] max-w-md" />
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={FileText} title="No invoices" description="Create one to get started." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2.5">#</th>
                  <th className="text-left px-4 py-2.5">Date</th>
                  <th className="text-left px-4 py-2.5">Client</th>
                  <th className="text-right px-4 py-2.5">Total</th>
                  <th className="text-left px-4 py-2.5">Status</th>
                  <th className="text-right px-4 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t border-border hover:bg-muted/20">
                    <td className="px-4 py-2.5 font-mono">{r.invoice_number}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{formatDate(r.date)}</td>
                    <td className="px-4 py-2.5">{r.client_name}</td>
                    <td className="px-4 py-2.5 text-right font-medium">{formatCurrency(Number(r.total || 0))}</td>
                    <td className="px-4 py-2.5">
                      {isAdmin ? (
                        <select
                          value={r.status}
                          onChange={(e) => markStatus(r, e.target.value)}
                          className="bg-transparent border border-border rounded px-2 py-1 text-xs"
                        >
                          {["Draft", "Sent", "Paid"].map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      ) : (
                        <span className="text-xs text-muted-foreground">{r.status}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="inline-flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => downloadPdf(r)} title="Download PDF">
                          <Download className="w-4 h-4" />
                        </Button>
                        {isAdmin && (
                          <Button size="sm" variant="ghost" onClick={() => { setEditing(r); setModalOpen(true); }} title="Edit">
                            <Pencil className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}
