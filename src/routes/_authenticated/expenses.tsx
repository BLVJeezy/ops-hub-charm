import { useCurrency } from "@/components/CurrencyToggle";
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
  useCurrency();
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
  const byCategory = useMemo(() => {
    const m: Record<string, number> = {};
    rows.forEach((r) => { m[r.category] = (m[r.category] || 0) + Number(r.monthly_cost || 0); });
    return Object.entries(m).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  async function del(r: Row) {
    if (!confirm(`Delete expense "${r.name}"?`)) return;
    const { error } = await supabase.from("expenses").delete().eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Expense deleted");
    load();
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-3 gap-3">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Expenses</h1>
        <Button onClick={() => { setEditing(null); setModalOpen(true); }} className="gap-2 shrink-0 bg-white text-black hover:bg-white/90 rounded-full h-10 px-4">
          <Plus className="w-4 h-4" /> New Expense
        </Button>
      </div>

      {/* Total, split by category */}
      <div className="tone tone-amber rounded-2xl border p-4 mb-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-xs text-muted-foreground">Fixed costs per month</div>
            <div className="text-4xl leading-none font-bold tracking-tight tabular-nums mt-1">{formatCurrency(total)}</div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-lg font-semibold tabular-nums leading-none">{formatCurrency(total * 12)}</div>
            <div className="text-[11px] text-muted-foreground mt-1">per year · {rows.length} item{rows.length === 1 ? "" : "s"}</div>
          </div>
        </div>
        {total > 0 && (
          <>
            <div className="flex h-2 rounded-full overflow-hidden bg-muted mt-4 gap-px" aria-hidden>
              {byCategory.map(([cat, amount]) => (
                <span key={cat} style={{ width: `${(amount / total) * 100}%`, backgroundColor: EXPENSE_CATEGORY_COLORS[cat] ?? "#B7BCC2" }} />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-muted-foreground">
              {byCategory.map(([cat, amount]) => (
                <span key={cat} className="inline-flex items-center gap-1.5">
                  <i className="w-2 h-2 rounded-sm" style={{ backgroundColor: EXPENSE_CATEGORY_COLORS[cat] ?? "#B7BCC2" }} />
                  {cat} <span className="text-foreground tabular-nums">{formatCurrency(amount)}</span>
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Expense rows */}
      {loading ? (
        <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-card">
          <EmptyState icon={Wallet} title="No expenses" description="Add your recurring monthly costs." />
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card divide-y divide-border mb-3">
          {[...rows].sort((x, y) => Number(y.monthly_cost || 0) - Number(x.monthly_cost || 0)).map((r) => {
            const color = EXPENSE_CATEGORY_COLORS[r.category] ?? "#B7BCC2";
            return (
              <div key={r.id} className="px-3.5 py-2.5">
                <div className="flex items-center gap-2">
                  <i className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <div className="font-semibold truncate min-w-0 flex-1">{r.name}</div>
                  <div className="font-bold tabular-nums shrink-0">{formatCurrency(Number(r.monthly_cost || 0))}</div>
                </div>
                <div className="flex items-center justify-between gap-2 pl-4">
                  <div className="text-[11px] text-muted-foreground truncate">
                    <span style={{ color }}>{r.category}</span> · {r.clients?.name ?? "Business-wide"}
                    {r.notes ? ` · ${r.notes}` : ""}
                  </div>
                  {isAdmin && (
                    <div className="flex shrink-0 -mr-1.5">
                      <Button size="icon" variant="ghost" className="h-7 w-7" title="Edit" onClick={() => { setEditing(r); setModalOpen(true); }}>
                        <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" title="Delete" onClick={() => del(r)}>
                        <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Planning reference, folded away: not part of the totals */}
      <details className="rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm">
        <summary className="cursor-pointer text-muted-foreground flex items-center gap-2"><Info className="w-3.5 h-3.5" /> Setup cost per new client (planning only)</summary>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div>
            <div className="text-[11px] text-muted-foreground">Website setup</div>
            <div className="text-lg font-bold">€41 – €75</div>
            <div className="text-[11px] text-muted-foreground">Domain €1-20 + build €30-45 + CookieYes €10</div>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground">SEO setup</div>
            <div className="text-lg font-bold">€20<span className="text-xs font-normal text-muted-foreground">/month</span></div>
            <div className="text-[11px] text-muted-foreground">Directory listing per client, the rest is manual work</div>
          </div>
        </div>
      </details>

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
