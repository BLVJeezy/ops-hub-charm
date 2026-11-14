import { useCurrency } from "@/components/CurrencyToggle";
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
  useCurrency();
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

  const sum = useMemo(() => {
    const active = rows.filter((r) => r.status === "Active");
    return {
      active: active.length,
      mrr: active.reduce((t, r) => t + clientMRR(r), 0),
      net: active.reduce((t, r) => t + clientMonthlyFee(r) - (costsByClient[r.id] || 0), 0),
      paid: rows.reduce((t, r) => t + (paidByClient[r.id] || 0), 0),
      attention: active.filter((r) => r.health && r.health !== "Green").length,
    };
  }, [rows, costsByClient, paidByClient]);
  const topMrr = Math.max(1, ...filtered.map((r) => clientMRR(r)));

  return (
    <div className="p-4 md:p-6 max-w-3xl lg:max-w-7xl mx-auto pb-24">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 mb-3">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight truncate">Clients</h1>
        <Button onClick={() => setModalOpen(true)} className="gap-2 shrink-0 bg-white text-black hover:bg-white/90 rounded-full h-10 px-4">
          <Plus className="w-4 h-4" /> New Client
        </Button>
      </div>

      {!loading && (
        <div className="tone tone-gold rounded-2xl border p-4 mb-3">
          <div className="lg:flex lg:items-center lg:gap-10">
            <div className="flex items-end justify-between gap-3 lg:block lg:shrink-0">
              <div>
                <div className="text-xs text-muted-foreground">Recurring per month</div>
                <div className="ink-gold text-4xl lg:text-5xl leading-none font-bold tracking-tight tabular-nums mt-1">{formatCurrency(sum.mrr)}</div>
              </div>
              <div className="text-right shrink-0 lg:hidden">
                <div className="text-lg font-semibold tabular-nums leading-none">{sum.active}</div>
                <div className="text-[11px] text-muted-foreground mt-1">active client{sum.active === 1 ? "" : "s"}</div>
              </div>
            </div>
            <div className="grid grid-cols-3 lg:grid-cols-4 gap-2 lg:gap-8 mt-3 pt-3 lg:mt-0 lg:pt-0 lg:pl-10 border-t lg:border-t-0 lg:border-l border-white/10 text-[11px] text-muted-foreground lg:flex-1">
              <div className="hidden lg:block"><div className="text-sm lg:text-xl font-semibold text-foreground tabular-nums">{sum.active}</div>active client{sum.active === 1 ? "" : "s"}</div>
              <div><div className="text-sm lg:text-xl font-semibold text-foreground tabular-nums">{formatCurrency(sum.net)}</div>net per month</div>
              <div><div className="text-sm lg:text-xl font-semibold text-foreground tabular-nums">{formatCurrency(sum.paid)}</div>paid so far</div>
              <div><div className="text-sm lg:text-xl font-semibold text-foreground tabular-nums">{sum.attention}</div>need attention</div>
            </div>
          </div>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab} className="mb-3">
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
        <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3 tone-gold">
          {[...filtered].sort((x, y) => clientMRR(y) - clientMRR(x) || x.name.localeCompare(y.name)).map((r) => {
            const total = paidByClient[r.id] || 0;
            const mrr = clientMRR(r);
            const net = clientMonthlyFee(r) - (costsByClient[r.id] || 0);
            return (
              <Link
                key={r.id} to="/clients/$id" params={{ id: r.id }}
                className="block rounded-xl border border-border bg-card px-3.5 py-2.5 hover:border-primary/40 transition"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <HealthDot health={r.health} />
                    <span className="font-semibold truncate">{r.name}</span>
                    {r.status !== "Active" && <StatusBadge status={r.status} />}
                  </div>
                  <div className="shrink-0 font-bold tabular-nums">
                    {mrr ? formatCurrency(mrr) : "—"}
                    {mrr > 0 && <span className="text-[11px] font-normal text-muted-foreground"> /mo</span>}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground mt-0.5">
                  <span className="truncate">{r.location || "No location"}</span>
                  <span className="shrink-0 tabular-nums">
                    {total ? `${formatCurrency(total)} paid` : "nothing paid yet"} · net {formatCurrency(net)}
                  </span>
                </div>
                {mrr > 0 && (
                  <div className="meter mt-1.5">
                    <i style={{ width: `${Math.max(3, (mrr / topMrr) * 100)}%` }} />
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}

      <ClientModal open={modalOpen} onOpenChange={setModalOpen} onSaved={() => load()} />
    </div>
  );
}
