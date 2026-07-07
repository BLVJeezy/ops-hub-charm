import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Wallet, Info, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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

function Expenses() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [rows, setRows] = useState<Row[]>([]);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);

  async function load() {
    const [e, c] = await Promise.all([
      supabase.from("expenses").select("*, clients:linked_client(name)").order("name"),
      supabase.from("clients").select("id,name").order("name"),
    ]);
    if (e.error) toast.error(e.error.message);
    setRows((e.data as unknown as Row[]) ?? []);
    setClients((c.data as unknown as { id: string; name: string }[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const ch = supabase.channel("expenses-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const total = useMemo(() => rows.reduce((s, r) => s + Number(r.monthly_cost || 0), 0), [rows]);

  async function del(r: Row) {
    if (!confirm(`Delete expense "${r.name}"?`)) return;
    const { error } = await supabase.from("expenses").delete().eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Expense deleted");
    load();
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4 gap-3">
        <h1 className="text-2xl font-semibold">Expenses</h1>
        <Button onClick={() => { setEditing(null); setModalOpen(true); }} className="gap-2 shrink-0 bg-white text-black hover:bg-white/90 rounded-full h-10 px-4">
          <Plus className="w-4 h-4" /> New Expense
        </Button>
      </div>

      {/* Total fixed monthly costs */}
      <div className="rounded-xl border border-border p-5 bg-gradient-to-br from-muted/60 via-card to-card mb-6">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Wallet className="w-4 h-4" /> Total fixed monthly costs
        </div>
        <div className="mt-1 text-4xl font-bold">{formatCurrency(total)}</div>
        <div className="text-sm text-muted-foreground mt-1">
          {rows.length} expense{rows.length === 1 ? "" : "s"} · business-wide + client-specific
        </div>
      </div>

      {/* Reference cards */}
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
        <Info className="w-3.5 h-3.5" /> Reference (planning only — not included in totals)
      </div>
      <div className="space-y-3 mb-6">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-sm text-muted-foreground">Avg. Website Setup Cost</div>
          <div className="text-2xl font-bold mt-1">€41 – €75</div>
          <div className="text-sm text-muted-foreground mt-1">Domain €1-20 + build €30-45 + CookieYes setup €10</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-sm text-muted-foreground">Avg. SEO Setup Cost</div>
          <div className="text-2xl font-bold mt-1">€20<span className="text-base font-normal text-muted-foreground">/month</span></div>
          <div className="text-sm text-muted-foreground mt-1">Directory listing €20/month per client — remaining SEO work is manual, no additional tool cost</div>
        </div>
      </div>

      {/* Expense cards */}
      {loading ? (
        <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-card">
          <EmptyState icon={Wallet} title="No expenses" description="Add your recurring monthly costs." />
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card divide-y divide-border">
          {rows.map((r) => {
            const color = EXPENSE_CATEGORY_COLORS[r.category] ?? "#B7BCC2";
            return (
              <div key={r.id} className="p-4">
                <div className="font-semibold">{r.name}</div>
                {r.notes && <div className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{r.notes}</div>}
                <span
                  className="inline-block mt-2 px-2 py-0.5 rounded-md text-xs font-medium"
                  style={{ backgroundColor: `${color}1A`, color }}
                >
                  {r.category}
                </span>
                <div className="font-semibold mt-2">{formatCurrency(Number(r.monthly_cost || 0))}</div>
                <div className="text-sm text-muted-foreground mt-0.5">
                  {r.clients?.name ?? "Business-wide"}
                </div>
                {isAdmin && (
                  <div className="flex justify-end gap-1 mt-1">
                    <Button size="icon" variant="ghost" onClick={() => { setEditing(r); setModalOpen(true); }}>
                      <Pencil className="w-4 h-4 text-muted-foreground" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => del(r)}>
                      <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

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
