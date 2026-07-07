import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge } from "@/components/StatusBadge";
import { HealthDot } from "@/components/HealthDot";
import { EmptyState } from "@/components/EmptyState";
import { ClientModal, type ClientRow } from "@/components/ClientModal";
import { formatCurrency } from "@/lib/format";
import { clientMRR, clientMonthlyFee } from "@/lib/fees";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/clients/")({
  component: ClientsPage,
});

type Row = ClientRow & { id: string };
type Invoice = { client: string | null; total: number; status: string };
type Expense = { linked_client: string | null; monthly_cost: number };

function ClientsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("Active");
  const [modalOpen, setModalOpen] = useState(false);

  async function load() {
    const [c, i, e] = await Promise.all([
      supabase.from("clients").select("*").order("name"),
      supabase.from("invoices").select("client,total,status"),
      supabase.from("expenses").select("linked_client,monthly_cost"),
    ]);
    if (c.error) toast.error(c.error.message);
    setRows((c.data as unknown as Row[]) ?? []);
    setInvoices((i.data as unknown as Invoice[]) ?? []);
    setExpenses((e.data as unknown as Expense[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const ch = supabase.channel("clients-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "clients" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const paidByClient = useMemo(() => {
    const map: Record<string, number> = {};
    invoices.filter((i) => i.status === "Paid" && i.client).forEach((i) => {
      map[i.client!] = (map[i.client!] || 0) + Number(i.total || 0);
    });
    return map;
  }, [invoices]);

  const costsByClient = useMemo(() => {
    const map: Record<string, number> = {};
    expenses.filter((e) => e.linked_client).forEach((e) => {
      map[e.linked_client!] = (map[e.linked_client!] || 0) + Number(e.monthly_cost || 0);
    });
    return map;
  }, [expenses]);

  const filtered = useMemo(() => {
    if (tab === "All") return rows.filter((r) => r.status === "Active" || r.status === "Paused");
    return rows.filter((r) => r.status === tab);
  }, [rows, tab]);

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto pb-24">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 mb-4">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight truncate">Clients</h1>
        <Button onClick={() => setModalOpen(true)} className="gap-2 shrink-0 bg-white text-black hover:bg-white/90 rounded-full h-10 px-4">
          <Plus className="w-4 h-4" /> New Client
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="mb-4">
        <TabsList>
          {(["Active", "Paused", "All"] as const).map((t) => (
            <TabsTrigger key={t} value={t}>{t}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card">
          <EmptyState icon={Users} title="No clients" description="Create your first client to get started." />
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => {
            const total = paidByClient[r.id] || 0;
            const mrr = clientMRR(r);
            const net = clientMonthlyFee(r) - (costsByClient[r.id] || 0);
            return (
              <Link
                key={r.id} to="/clients/$id" params={{ id: r.id }}
                className="block rounded-xl border border-border bg-card p-4 hover:border-primary/40 transition"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <HealthDot health={r.health} />
                    <span className="font-semibold text-lg truncate">{r.name}</span>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
                {r.location && <div className="text-sm text-muted-foreground mt-1">{r.location}</div>}
                <div className="text-sm text-muted-foreground mt-2">
                  Total {total ? formatCurrency(total) : "—"} · MRR {mrr ? formatCurrency(mrr) : "—"} · Net {formatCurrency(net)}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <ClientModal open={modalOpen} onOpenChange={setModalOpen} onSaved={() => load()} />
    </div>
  );
}
