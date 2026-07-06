import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDate, daysUntil, todayISO } from "@/lib/format";
import { computeMRR } from "@/lib/fees";
import { StatusBadge, StageBadge } from "@/components/StatusBadge";
import { HealthDot } from "@/components/HealthDot";
import { PIPELINE_STAGES } from "@/lib/constants";
import { CalendarDays, TrendingUp, Wallet, Users, AlertTriangle, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/")({
  component: Dashboard,
});

type Client = { id: string; name: string; status: string | null; stage: string | null; health: string | null;
  billing_frequency: string | null; monthly_fee: number | null; yearly_fee: number | null;
  website_needed: boolean | null; website_billing_frequency: string | null;
  website_monthly_fee: number | null; website_yearly_fee: number | null;
};
type Action = { id: string; action_description: string; due_date: string | null; status: string | null;
  clients: { name: string } | null; client_id: string | null;
};
type Invoice = { id: string; invoice_number: number; amount: number; status: string; issue_date: string; client_id: string | null;
  clients: { name: string } | null;
};
type Expense = { id: string; amount: number; category: string };

function Card({ title, icon: Icon, children, className = "" }: { title: string; icon?: any; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-border bg-card p-4 ${className}`}>
      <div className="flex items-center gap-2 mb-3">
        {Icon && <Icon className="w-4 h-4 text-muted-foreground" />}
        <h3 className="text-sm font-semibold text-muted-foreground">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function KPI({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function Dashboard() {
  const [clients, setClients] = useState<Client[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [c, a, i, e] = await Promise.all([
        supabase.from("clients" as never).select("*"),
        supabase.from("actions" as never).select("*, clients:client_id(name)").neq("status", "Completed").order("due_date", { ascending: true }).limit(50),
        supabase.from("invoices" as never).select("*, clients:client_id(name)").order("issue_date", { ascending: false }),
        supabase.from("expenses" as never).select("id,amount,category"),
      ]);
      setClients((c.data as Client[]) || []);
      setActions((a.data as Action[]) || []);
      setInvoices((i.data as Invoice[]) || []);
      setExpenses((e.data as Expense[]) || []);
      setLoading(false);
    })();
  }, []);

  const activeClients = useMemo(() => clients.filter((c) => c.status === "Active"), [clients]);
  const mrr = useMemo(() => activeClients.reduce((s, c) => s + computeMRR(c), 0), [activeClients]);
  const monthlyExpenses = useMemo(() => expenses.reduce((s, e) => s + Number(e.amount || 0), 0), [expenses]);
  const monthlyMargin = mrr - monthlyExpenses;

  const outstanding = useMemo(
    () => invoices.filter((i) => i.status !== "Paid").reduce((s, i) => s + Number(i.amount || 0), 0),
    [invoices]
  );
  const paidYTD = useMemo(() => {
    const y = new Date().getFullYear();
    return invoices.filter((i) => i.status === "Paid" && new Date(i.issue_date).getFullYear() === y)
      .reduce((s, i) => s + Number(i.amount || 0), 0);
  }, [invoices]);

  // Revenue chart: last 12 months paid invoices
  const revenueData = useMemo(() => {
    const months: { key: string; label: string; revenue: number }[] = [];
    const now = new Date();
    for (let k = 11; k >= 0; k--) {
      const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.push({ key, label: d.toLocaleDateString("en", { month: "short" }), revenue: 0 });
    }
    invoices.filter((i) => i.status === "Paid").forEach((inv) => {
      const d = new Date(inv.issue_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const bucket = months.find((m) => m.key === key);
      if (bucket) bucket.revenue += Number(inv.amount || 0);
    });
    return months;
  }, [invoices]);

  const thisWeekTasks = useMemo(() => {
    return actions.filter((a) => {
      const d = daysUntil(a.due_date);
      return d !== null && d <= 7;
    }).slice(0, 8);
  }, [actions]);

  const overdueCount = actions.filter((a) => {
    const d = daysUntil(a.due_date);
    return d !== null && d < 0;
  }).length;

  const pipelineCounts = useMemo(() => {
    const map: Record<string, number> = {};
    PIPELINE_STAGES.forEach((s) => { map[s] = 0; });
    clients.filter((c) => c.status === "Prospect").forEach((c) => {
      const s = c.stage || "Found";
      map[s] = (map[s] || 0) + 1;
    });
    return map;
  }, [clients]);

  const healthBreakdown = useMemo(() => {
    const counts = { Green: 0, Orange: 0, Red: 0, "Not set": 0 };
    activeClients.forEach((c) => {
      const h = (c.health || "Not set") as keyof typeof counts;
      counts[h] = (counts[h] || 0) + 1;
    });
    return counts;
  }, [activeClients]);

  if (loading) {
    return <div className="p-6 text-muted-foreground">Loading dashboard…</div>;
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <div className="text-sm text-muted-foreground">{formatDate(todayISO())}</div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card title="MRR" icon={TrendingUp}>
          <KPI label="Monthly recurring" value={formatCurrency(mrr)} sub={`${activeClients.length} active`} />
        </Card>
        <Card title="Margin" icon={Wallet}>
          <KPI label="MRR – expenses" value={formatCurrency(monthlyMargin)} sub={`${formatCurrency(monthlyExpenses)} costs`} />
        </Card>
        <Card title="Outstanding" icon={AlertTriangle}>
          <KPI label="Unpaid invoices" value={formatCurrency(outstanding)} />
        </Card>
        <Card title="Paid YTD" icon={CheckCircle2}>
          <KPI label={String(new Date().getFullYear())} value={formatCurrency(paidYTD)} />
        </Card>
      </div>

      {/* Revenue chart */}
      <Card title="Revenue — last 12 months" icon={TrendingUp}>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={revenueData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `€${v}`} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                formatter={(v: number) => formatCurrency(v)}
              />
              <Bar dataKey="revenue" fill="#C9A24B" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* This week */}
        <Card title="This week" icon={CalendarDays}>
          {thisWeekTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing due in the next 7 days.</p>
          ) : (
            <ul className="space-y-2">
              {thisWeekTasks.map((a) => {
                const d = daysUntil(a.due_date);
                const overdue = d !== null && d < 0;
                return (
                  <li key={a.id} className="flex items-center justify-between gap-3 text-sm">
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{a.action_description}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {a.clients?.name || "—"} · {formatDate(a.due_date)}
                      </div>
                    </div>
                    <span className={`text-xs whitespace-nowrap ${overdue ? "text-destructive" : "text-muted-foreground"}`}>
                      {overdue ? `${Math.abs(d!)}d late` : d === 0 ? "today" : `${d}d`}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {overdueCount > 0 && (
            <Link to="/action-planner" className="mt-3 inline-block text-xs text-destructive hover:underline">
              {overdueCount} overdue →
            </Link>
          )}
        </Card>

        {/* Pipeline overview */}
        <Card title="Pipeline" icon={Users}>
          <div className="space-y-1.5">
            {PIPELINE_STAGES.map((s) => (
              <Link key={s} to="/pipeline" className="flex items-center justify-between text-sm hover:bg-accent/40 rounded px-2 py-1 -mx-2">
                <div className="flex items-center gap-2"><StageBadge stage={s} /></div>
                <span className="tabular-nums text-muted-foreground">{pipelineCounts[s] || 0}</span>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      {/* Health + recent invoices */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Client health" icon={Users}>
          <div className="space-y-2">
            {(["Green", "Orange", "Red", "Not set"] as const).map((h) => (
              <div key={h} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2"><HealthDot health={h} /><span>{h}</span></div>
                <span className="tabular-nums text-muted-foreground">{healthBreakdown[h]}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-border">
            <p className="text-xs text-muted-foreground mb-2">At-risk (Red / Orange)</p>
            <ul className="space-y-1.5">
              {activeClients.filter((c) => c.health === "Red" || c.health === "Orange").slice(0, 5).map((c) => (
                <li key={c.id} className="flex items-center justify-between text-sm">
                  <Link to="/clients/$id" params={{ id: c.id }} className="flex items-center gap-2 hover:underline min-w-0">
                    <HealthDot health={c.health} /><span className="truncate">{c.name}</span>
                  </Link>
                  <StatusBadge status={c.status} />
                </li>
              ))}
              {activeClients.filter((c) => c.health === "Red" || c.health === "Orange").length === 0 && (
                <li className="text-xs text-muted-foreground">All healthy.</li>
              )}
            </ul>
          </div>
        </Card>

        <Card title="Recent invoices" icon={Wallet}>
          <ul className="space-y-2">
            {invoices.slice(0, 6).map((inv) => (
              <li key={inv.id} className="flex items-center justify-between text-sm">
                <div className="min-w-0">
                  <div className="truncate">#{inv.invoice_number} · {inv.clients?.name || "—"}</div>
                  <div className="text-xs text-muted-foreground">{formatDate(inv.issue_date)}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="tabular-nums">{formatCurrency(inv.amount)}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    inv.status === "Paid" ? "bg-green-500/20 text-green-400" :
                    inv.status === "Sent" ? "bg-yellow-500/20 text-yellow-400" :
                    "bg-muted text-muted-foreground"
                  }`}>{inv.status}</span>
                </div>
              </li>
            ))}
            {invoices.length === 0 && <li className="text-sm text-muted-foreground">No invoices yet.</li>}
          </ul>
          <Link to="/invoices" className="mt-3 inline-block text-xs text-muted-foreground hover:text-foreground hover:underline">
            View all invoices →
          </Link>
        </Card>
      </div>
    </div>
  );
}
