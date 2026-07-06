import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Wallet, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState } from "@/components/EmptyState";
import { ExpenseModal, type ExpenseRow } from "@/components/ExpenseModal";
import { formatCurrency } from "@/lib/format";
import { EXPENSE_CATEGORY_COLORS } from "@/lib/constants";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/expenses")({
  component: Expenses,
});

type Row = ExpenseRow & { id: string; clients?: { name: string } | null };
type Client = { id: string; name: string };

function Expenses() {
  const [rows, setRows] = useState<Row[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState("all");
  const [scope, setScope] = useState("all");
  const [q, setQ] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);

  async function load() {
    setLoading(true);
    const [e, c] = await Promise.all([
      supabase.from("expenses").select("*, clients:linked_client(name)").order("monthly_cost", { ascending: false }),
      supabase.from("clients").select("id,name").order("name"),
    ]);
    if (e.error) toast.error(e.error.message);
    setRows((e.data as unknown as Row[]) ?? []);
    setClients((c.data as unknown as Client[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const ch = supabase.channel("expenses-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const filtered = useMemo(() => {
    let list = rows;
    if (cat !== "all") list = list.filter((r) => r.category === cat);
    if (scope === "business") list = list.filter((r) => !r.linked_client);
    else if (scope === "client") list = list.filter((r) => !!r.linked_client);
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter((r) => r.name.toLowerCase().includes(s) || (r.clients?.name || "").toLowerCase().includes(s));
    }
    return list;
  }, [rows, cat, scope, q]);

  const totals = useMemo(() => {
    const monthly = rows.reduce((s, r) => s + Number(r.monthly_cost || 0), 0);
    const business = rows.filter(r => !r.linked_client).reduce((s, r) => s + Number(r.monthly_cost || 0), 0);
    const client = monthly - business;
    return { monthly, business, client };
  }, [rows]);

  async function del(r: Row) {
    if (!confirm(`Delete "${r.name}"?`)) return;
    const { error } = await supabase.from("expenses").delete().eq("id", r.id);
    if (error) toast.error(error.message);
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold">Expenses</h1>
        <Button onClick={() => { setEditing(null); setModalOpen(true); }} className="gap-2">
          <Plus className="w-4 h-4" /> New expense
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <Stat label="Total monthly" value={formatCurrency(totals.monthly)} />
        <Stat label="Business-wide" value={formatCurrency(totals.business)} />
        <Stat label="Client-linked" value={formatCurrency(totals.client)} />
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Select value={cat} onValueChange={setCat}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {["Tool", "Directory/Citations", "Subscription", "Other"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={scope} onValueChange={setScope}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All scopes</SelectItem>
            <SelectItem value="business">Business-wide</SelectItem>
            <SelectItem value="client">Client-linked</SelectItem>
          </SelectContent>
        </Select>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="flex-1 min-w-[200px] max-w-md" />
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={Wallet} title="No expenses" description="Add your recurring monthly costs." />
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((r) => {
              const color = EXPENSE_CATEGORY_COLORS[r.category] ?? "#B7BCC2";
              return (
                <li key={r.id} className="p-3 flex items-center gap-3 hover:bg-muted/20">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{r.name}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <span>{r.category}</span>
                      <span>·</span>
                      <span>{r.clients?.name ? `Client: ${r.clients.name}` : "Business-wide"}</span>
                    </div>
                  </div>
                  <div className="text-right tabular-nums font-medium mr-2">
                    {formatCurrency(Number(r.monthly_cost || 0))}<span className="text-xs text-muted-foreground">/mo</span>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(r); setModalOpen(true); }}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => del(r)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ExpenseModal
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
