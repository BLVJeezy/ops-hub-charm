import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDate, daysUntil, todayISO } from "@/lib/format";
import { clientMRR, clientRevenueForMonth, type FeeClient } from "@/lib/fees";
import { StageBadge } from "@/components/StatusBadge";
import { HealthDot } from "@/components/HealthDot";
import { QuickAddProspect } from "@/components/QuickAddProspect";
import { PIPELINE_STAGES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { CalendarDays, TrendingUp, Wallet, Users, AlertTriangle, Plus, Trophy, Crown } from "lucide-react";

export const Route = createFileRoute("/_authenticated/")({
  component: Dashboard,
});

type Client = FeeClient & {
  id: string; name: string; status: string | null; pipeline_stage: string | null;
  health: string | null; renewal_date: string | null; next_followup_date: string | null;
};
type Action = { id: string; client: string; action_description: string; due_date: string | null; status: string | null; waiting_period: string | null };
type Invoice = { id: string; invoice_number: number; client: string | null; client_name: string | null; total: number; status: string; date: string };
type Expense = { id: string; monthly_cost: number; linked_client: string | null };

function Card({ title, icon: Icon, children, className = "" }: { title: string; icon?: React.ComponentType<{ className?: string }>; children: React.ReactNode; className?: string }) {
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

type Task = { key: string; clientId: string; label: string; detail: string; date: string; kind: "followup" | "action" | "renewal"; overdue: boolean };

function Dashboard() {
  const [clients, setClients] = useState<Client[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [quickAdd, setQuickAdd] = useState(false);

  async function load() {
    const [c, a, i, e] = await Promise.all([
      supabase.from("clients").select("*"),
      supabase.from("actions").select("id,client,action_description,due_date,status,waiting_period"),
      supabase.from("invoices").select("id,invoice_number,client,client_name,total,status,date"),
      supabase.from("expenses").select("id,monthly_cost,linked_client"),
    ]);
    setClients((c.data as unknown as Client[]) ?? []);
    setActions((a.data as unknown as Action[]) ?? []);
    setInvoices((i.data as unknown as Invoice[]) ?? []);
    setExpenses((e.data as unknown as Expense[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const ch = supabase.channel("dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "clients" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "actions" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const clientById = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c])), [clients]);
  const activeClients = useMemo(() => clients.filter((c) => c.status === "Active"), [clients]);

  // ===== Financials =====
  const mrr = useMemo(() => activeClients.reduce((s, c) => s + clientMRR(c), 0), [activeClients]);
  const jrr = mrr * 12;

  // §4.11 — business-wide expenses always count; client-linked only if client Active
  const totalMonthlyExpenses = useMemo(() => expenses.reduce((sum, e) => {
    if (e.linked_client) {
      const c = clientById[e.linked_client];
      if (!c || c.status !== "Active") return sum;
    }
    return sum + Number(e.monthly_cost || 0);
  }, 0), [expenses, clientById]);

  const netProfit = mrr - totalMonthlyExpenses;

  const lifetimeRevenue = useMemo(
    () => invoices.filter((i) => i.status === "Paid").reduce((s, i) => s + Number(i.total || 0), 0),
    [invoices]
  );

  // §4.14 — Pipeline Value
  const pipelineValue = useMemo(
    () => clients
      .filter((c) => c.status === "Prospect" && (c.pipeline_stage === "Proposal Sent" || c.pipeline_stage === "Negotiating"))
      .reduce((s, c) => s + clientMRR(c), 0),
    [clients]
  );

  // §4.15 — Top Revenue (top 3 by paid invoices)
  const topRevenue = useMemo(() => {
    const paidByClient: Record<string, number> = {};
    invoices.filter((i) => i.status === "Paid" && i.client).forEach((i) => {
      paidByClient[i.client!] = (paidByClient[i.client!] || 0) + Number(i.total || 0);
    });
    return Object.entries(paidByClient)
      .map(([id, total]) => ({ id, total, name: clientById[id]?.name ?? "Unknown" }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 3);
  }, [invoices, clientById]);

  // ===== §4.16 Revenue Report (contract-based, This Year vs Last Year) =====
  const now = new Date();
  const year = now.getFullYear();
  const revenueReport = useMemo(() => {
    const rows = Array.from({ length: 12 }, (_, m) => ({
      label: new Date(year, m, 1).toLocaleDateString("en", { month: "short" }),
      thisYear: 0,
      lastYear: 0,
    }));
    for (const c of clients) {
      for (let m = 0; m < 12; m++) {
        rows[m].thisYear += clientRevenueForMonth(c, year, m);
        rows[m].lastYear += clientRevenueForMonth(c, year - 1, m);
      }
    }
    return rows;
  }, [clients, year]);

  const ytd = revenueReport.slice(0, now.getMonth() + 1).reduce((s, r) => s + r.thisYear, 0);
  const lastYearTotal = revenueReport.reduce((s, r) => s + r.lastYear, 0);
  const thisMonth = revenueReport[now.getMonth()].thisYear;
  const lastMonth = now.getMonth() === 0
    ? revenueReport[11].lastYear
    : revenueReport[now.getMonth() - 1].thisYear;
  const momChange = lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : null;

  // ===== §4.18 This Week tasks =====
  const tasks = useMemo(() => {
    const list: Task[] = [];
    for (const c of clients) {
      if (c.status !== "Write-off" && c.next_followup_date) {
        const d = daysUntil(c.next_followup_date);
        if (d !== null && d <= 7) {
          list.push({
            key: `f-${c.id}`, clientId: c.id, kind: "followup",
            label: `Follow up: ${c.name}`, detail: d < 0 ? `${Math.abs(d)}d overdue` : d === 0 ? "today" : `in ${d}d`,
            date: c.next_followup_date, overdue: d < 0,
          });
        }
      }
      if (c.status === "Active" && c.renewal_date) {
        const d = daysUntil(c.renewal_date);
        if (d !== null && d >= 0 && d <= 30) {
          list.push({
            key: `r-${c.id}`, clientId: c.id, kind: "renewal",
            label: `Renewal: ${c.name}`, detail: `in ${d}d`, date: c.renewal_date, overdue: false,
          });
        }
      }
    }
    for (const a of actions) {
      if (a.status === "Completed" || a.waiting_period === "Ongoing" || !a.due_date) continue;
      const d = daysUntil(a.due_date);
      if (d !== null && d < 0) {
        const c = clientById[a.client];
        list.push({
          key: `a-${a.id}`, clientId: a.client, kind: "action",
          label: a.action_description, detail: `${c?.name ?? "—"} · ${Math.abs(d)}d overdue`,
          date: a.due_date, overdue: true,
        });
      }
    }
    return list.sort((x, y) => x.date.localeCompare(y.date)).slice(0, 10);
  }, [clients, actions, clientById]);

  // ===== Pipeline overview & health =====
  const pipelineCounts = useMemo(() => {
    const map: Record<string, number> = {};
    PIPELINE_STAGES.forEach((s) => { map[s] = 0; });
    clients.filter((c) => c.status === "Prospect" || c.status === "Write-off").forEach((c) => {
      const s = c.pipeline_stage || "Found";
      map[s] = (map[s] || 0) + 1;
    });
    return map;
  }, [clients]);

  const healthBreakdown = useMemo(() => {
    const counts = { Green: 0, Orange: 0, Red: 0 };
    activeClients.forEach((c) => {
      if (c.health === "Green" || c.health === "Orange" || c.health === "Red") counts[c.health]++;
    });
    return counts;
  }, [activeClients]);

  const atRisk = activeClients.filter((c) => c.health === "Red");

  if (loading) return <div className="p-6 text-muted-foreground">Loading dashboard…</div>;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <Button onClick={() => setQuickAdd(true)} className="gap-2"><Plus className="w-4 h-4" /> New prospect</Button>
      </div>

      {/* This Week */}
      <Card title="This week" icon={CalendarDays}>
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">All caught up 🎉</p>
        ) : (
          <ul className="space-y-2">
            {tasks.map((t) => (
              <li key={t.key}>
                <Link to="/clients/$id" params={{ id: t.clientId }} className="flex items-center justify-between gap-3 text-sm hover:bg-accent/40 rounded px-2 py-1 -mx-2">
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{t.label}</div>
                    <div className="text-xs text-muted-foreground truncate">{formatDate(t.date)} · {t.kind}</div>
                  </div>
                  <span className={`text-xs whitespace-nowrap ${t.overdue ? "text-destructive" : "text-muted-foreground"}`}>{t.detail}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Lifetime revenue */}
      <div className="rounded-xl border border-border p-5 bg-gradient-to-br from-primary/20 via-card to-card">
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Crown className="w-4 h-4 text-primary" /> Lifetime revenue</div>
        <div className="mt-1 text-3xl font-bold text-primary">{formatCurrency(lifetimeRevenue)}</div>
        <div className="text-xs text-muted-foreground mt-1">Sum of all paid invoices</div>
      </div>

      {/* MRR + Net profit */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card title="Total MRR" icon={TrendingUp}>
          <KPI label="Monthly recurring" value={formatCurrency(mrr)} sub={`${activeClients.length} active clients`} />
        </Card>
        <Card title="Net profit" icon={Wallet}>
          <KPI label="MRR − expenses" value={formatCurrency(netProfit)} sub={`${formatCurrency(totalMonthlyExpenses)} monthly costs`} />
        </Card>
      </div>

      {/* JRR / Pipeline value / Top revenue */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card title="JRR" icon={TrendingUp}>
          <KPI label="Yearly run-rate" value={formatCurrency(jrr)} sub="MRR × 12" />
        </Card>
        <Card title="Pipeline value" icon={Users}>
          <KPI label="Proposal + negotiating" value={formatCurrency(pipelineValue)} sub="Potential MRR" />
        </Card>
        <Card title="Top revenue" icon={Trophy}>
          {topRevenue.length === 0 ? (
            <p className="text-sm text-muted-foreground">No paid invoices yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {topRevenue.map((t, i) => (
                <li key={t.id} className="flex items-center justify-between text-sm">
                  <Link to="/clients/$id" params={{ id: t.id }} className="truncate hover:underline">
                    <span className="text-muted-foreground mr-1.5">{i + 1}.</span>{t.name}
                  </Link>
                  <span className="tabular-nums text-muted-foreground">{formatCurrency(t.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Revenue report §4.16 */}
      <Card title={`Revenue report — ${year} vs ${year - 1}`} icon={TrendingUp}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <KPI label={`${year} YTD`} value={formatCurrency(ytd)} />
          <KPI label={`${year - 1} total`} value={formatCurrency(lastYearTotal)} />
          <KPI label="This month" value={formatCurrency(thisMonth)}
            sub={momChange === null ? undefined : `${momChange >= 0 ? "▲" : "▼"} ${Math.abs(momChange).toFixed(0)}% vs last month`} />
          <KPI label="Last month" value={formatCurrency(lastMonth)} />
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={revenueReport}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `€${v}`} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                formatter={(v: number) => formatCurrency(v)}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar name={String(year - 1)} dataKey="lastYear" fill="#B7BCC2" radius={[4, 4, 0, 0]} />
              <Bar name={String(year)} dataKey="thisYear" fill="#C9A24B" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pipeline overview */}
        <Card title="Pipeline overview" icon={Users}>
          <div className="grid grid-cols-2 gap-1.5">
            {PIPELINE_STAGES.filter((s) => s !== "Converted").map((s) => (
              <Link key={s} to="/pipeline" className="flex items-center justify-between text-sm hover:bg-accent/40 rounded px-2 py-1">
                <StageBadge stage={s} />
                <span className="tabular-nums text-muted-foreground">{pipelineCounts[s] || 0}</span>
              </Link>
            ))}
          </div>
        </Card>

        {/* Client health */}
        <Card title="Client health" icon={AlertTriangle}>
          <div className="flex items-center gap-6 mb-3">
            {(["Green", "Orange", "Red"] as const).map((h) => (
              <div key={h} className="flex items-center gap-2 text-sm">
                <HealthDot health={h} /><span className="tabular-nums font-semibold">{healthBreakdown[h]}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mb-2">At-risk (Red)</p>
          {atRisk.length === 0 ? (
            <p className="text-sm text-muted-foreground">No at-risk clients.</p>
          ) : (
            <ul className="space-y-1.5">
              {atRisk.map((c) => (
                <li key={c.id}>
                  <Link to="/clients/$id" params={{ id: c.id }} className="flex items-center gap-2 text-sm hover:underline">
                    <HealthDot health={c.health} /><span className="truncate">{c.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <QuickAddProspect open={quickAdd} onOpenChange={setQuickAdd} />
    </div>
  );
}
