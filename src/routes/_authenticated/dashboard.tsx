import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDate, daysUntil } from "@/lib/format";
import { clientMRR, clientRevenueForMonth, type FeeClient } from "@/lib/fees";
import { HealthDot } from "@/components/HealthDot";
import { QuickAddProspect } from "@/components/QuickAddProspect";
import { PIPELINE_STAGES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { CalendarDays, TrendingUp, BarChart3, Heart, Plus, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

type Client = FeeClient & {
  id: string; name: string; status: string | null; pipeline_stage: string | null;
  health: string | null; renewal_date: string | null; next_followup_date: string | null;
};
type Action = { id: string; client: string; action_description: string; due_date: string | null; status: string | null; waiting_period: string | null };
type Invoice = { id: string; invoice_number: number; client: string | null; client_name: string | null; total: number; status: string; date: string };
type Expense = { id: string; monthly_cost: number; linked_client: string | null };

type Task = { key: string; clientId: string; label: string; detail: string; date: string; kind: "followup" | "action" | "renewal"; overdue: boolean; healthDotColor?: string };

function SectionHeader({ icon: Icon, label, count }: { icon: React.ComponentType<{ className?: string }>; label: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 mb-3 mt-2">
      <Icon className="w-4 h-4 text-muted-foreground" />
      <span className="text-xs font-semibold tracking-[0.15em] text-muted-foreground uppercase">{label}</span>
      {count !== undefined && count > 0 && (
        <span className="text-[11px] font-medium rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{count}</span>
      )}
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-border bg-card p-4 ${className}`}>{children}</div>;
}

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

  const mrr = useMemo(() => activeClients.reduce((s, c) => s + clientMRR(c), 0), [activeClients]);
  const jrr = mrr * 12;

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

  const pipelineValue = useMemo(
    () => clients
      .filter((c) => c.status === "Prospect" && (c.pipeline_stage === "Proposal Sent" || c.pipeline_stage === "Negotiating"))
      .reduce((s, c) => s + clientMRR(c), 0),
    [clients]
  );

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
  const lastMonth = now.getMonth() === 0 ? revenueReport[11].thisYear : revenueReport[now.getMonth() - 1].thisYear;
  const momChange = lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : null;

  const tasks = useMemo(() => {
    const list: Task[] = [];
    for (const c of clients) {
      if (c.status !== "Write-off" && c.next_followup_date) {
        const d = daysUntil(c.next_followup_date);
        if (d !== null && d <= 7) {
          list.push({
            key: `f-${c.id}`, clientId: c.id, kind: "followup",
            label: c.name,
            detail: d < 0 ? `Follow-up overdue · ${formatDate(c.next_followup_date)}` : d === 0 ? `Follow-up today · ${formatDate(c.next_followup_date)}` : `Follow-up in ${d}d · ${formatDate(c.next_followup_date)}`,
            date: c.next_followup_date, overdue: d < 0,
            healthDotColor: d < 0 ? "#EF4444" : d <= 2 ? "#F59E0B" : "#22C55E",
          });
        }
      }
      if (c.status === "Active" && c.renewal_date) {
        const d = daysUntil(c.renewal_date);
        if (d !== null && d >= 0 && d <= 30) {
          list.push({
            key: `r-${c.id}`, clientId: c.id, kind: "renewal",
            label: c.name, detail: `Renewal in ${d}d · ${formatDate(c.renewal_date)}`,
            date: c.renewal_date, overdue: false,
            healthDotColor: "#F59E0B",
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
          label: c?.name ?? "—", detail: `${a.action_description} · ${Math.abs(d)}d overdue`,
          date: a.due_date, overdue: true,
          healthDotColor: "#EF4444",
        });
      }
    }
    return list.sort((x, y) => x.date.localeCompare(y.date)).slice(0, 10);
  }, [clients, actions, clientById]);

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

  if (loading) return <div className="p-6 text-muted-foreground">Loading dashboard…</div>;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-2">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <Button onClick={() => setQuickAdd(true)} variant="secondary" className="gap-2 bg-white text-black hover:bg-white/90 rounded-full h-10 px-4">
          <Plus className="w-4 h-4" /> New Prospect
        </Button>
      </div>

      {/* THIS WEEK */}
      <SectionHeader icon={CalendarDays} label="This week" count={tasks.length} />
      {tasks.length === 0 ? (
        <Card><p className="text-sm text-muted-foreground">All caught up 🎉</p></Card>
      ) : (
        <div className="space-y-2">
          {tasks.slice(0, 5).map((t) => (
            <Link key={t.key} to="/clients/$id" params={{ id: t.clientId }}
              className="block rounded-2xl border border-border bg-card p-4 hover:border-white/20 transition">
              <div className="flex items-center gap-3">
                <CalendarDays className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{t.label}</div>
                  <div className={`text-xs mt-0.5 truncate ${t.overdue ? "text-destructive" : "text-muted-foreground"}`}>{t.detail}</div>
                </div>
                <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: t.healthDotColor }} />
                <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* FINANCIALS */}
      <SectionHeader icon={TrendingUp} label="Financials" />

      <Card className="bg-gradient-to-br from-white/[0.04] to-transparent">
        <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.15em] text-muted-foreground uppercase">
          <TrendingUp className="w-3.5 h-3.5" /> Lifetime revenue
        </div>
        <div className="mt-1 text-4xl font-bold tracking-tight">{formatCurrency(lifetimeRevenue)}</div>
        <div className="text-xs text-muted-foreground mt-1">Total received from paid invoices</div>
      </Card>

      <div className="grid grid-cols-2 gap-2">
        <Card>
          <div className="text-sm text-muted-foreground">Total MRR</div>
          <div className="text-3xl font-bold mt-1">{formatCurrency(mrr)}</div>
          <div className="text-xs text-muted-foreground mt-1">{activeClients.length} active clients</div>
        </Card>
        <Card className="ring-1 ring-white/10">
          <div className="text-sm text-muted-foreground">Net Profit</div>
          <div className="text-3xl font-bold mt-1">{formatCurrency(netProfit)}</div>
          <div className="text-xs text-muted-foreground mt-1">MRR {formatCurrency(mrr)} − Costs {formatCurrency(totalMonthlyExpenses)}</div>
        </Card>
      </div>

      <Card>
        <div className="text-sm text-muted-foreground">Yearly (JRR)</div>
        <div className="text-3xl font-bold mt-1">{formatCurrency(jrr)}</div>
        <div className="text-xs text-muted-foreground mt-1">Annual recurring</div>
      </Card>

      <Card>
        <div className="text-sm text-muted-foreground">Pipeline Value</div>
        <div className="text-3xl font-bold mt-1">{formatCurrency(pipelineValue)}</div>
        <div className="text-xs text-muted-foreground mt-1">Proposal/Negotiating</div>
      </Card>

      <Card>
        <div className="text-sm mb-3">Top Revenue</div>
        {topRevenue.length === 0 ? (
          <p className="text-sm text-muted-foreground">No paid invoices yet.</p>
        ) : (
          <ul className="space-y-2">
            {topRevenue.map((t, i) => (
              <li key={t.id}>
                <Link to="/clients/$id" params={{ id: t.id }} className="flex items-center justify-between text-sm hover:underline">
                  <span>{i + 1}. {t.name}</span>
                  <span className="tabular-nums text-muted-foreground">{formatCurrency(t.total)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* REVENUE REPORT */}
      <SectionHeader icon={BarChart3} label="Revenue report" />

      <div className="grid grid-cols-2 gap-2">
        <Card>
          <div className="text-sm text-muted-foreground">{year} (YTD)</div>
          <div className="text-3xl font-bold mt-1">{formatCurrency(ytd)}</div>
        </Card>
        <Card>
          <div className="text-sm text-muted-foreground">{year - 1} Total</div>
          <div className="text-3xl font-bold mt-1">{formatCurrency(lastYearTotal)}</div>
          <div className="text-xs text-muted-foreground mt-1">Full year</div>
        </Card>
        <Card>
          <div className="text-sm text-muted-foreground">This Month</div>
          <div className="text-3xl font-bold mt-1">{formatCurrency(thisMonth)}</div>
          {momChange !== null && (
            <div className={`text-xs mt-1 ${momChange >= 0 ? "text-emerald-400" : "text-destructive"}`}>
              {momChange >= 0 ? "▲" : "▼"} {Math.abs(momChange).toFixed(1)}% vs last month
            </div>
          )}
        </Card>
        <Card>
          <div className="text-sm text-muted-foreground">Last Month</div>
          <div className="text-3xl font-bold mt-1">{formatCurrency(lastMonth)}</div>
          <div className="text-xs text-muted-foreground mt-1">Previous month</div>
        </Card>
      </div>

      <Card>
        <div className="h-64 -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={revenueReport}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} axisLine={false} tickLine={false} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => `$${v}`} axisLine={false} tickLine={false} width={45} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                formatter={(v: number) => formatCurrency(v)}
                cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} iconType="square" />
              <Bar name="Last Year" dataKey="lastYear" fill="#4B5563" radius={[2, 2, 0, 0]} />
              <Bar name="This Year" dataKey="thisYear" fill="#FFFFFF" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* PIPELINE OVERVIEW */}
      <SectionHeader icon={BarChart3} label="Pipeline overview" />
      <div className="grid grid-cols-2 gap-2">
        {PIPELINE_STAGES.filter((s) => s !== "Converted").map((s) => (
          <Link key={s} to="/pipeline" className="rounded-2xl border border-border bg-card p-4 hover:border-white/20 transition">
            <div className="text-sm text-muted-foreground">{s}</div>
            <div className="text-2xl font-bold mt-1 tabular-nums">{pipelineCounts[s] || 0}</div>
          </Link>
        ))}
      </div>

      {/* CLIENT HEALTH */}
      <SectionHeader icon={Heart} label="Client health" />
      <Card>
        <div className="grid grid-cols-3 gap-4">
          {(["Green", "Orange", "Red"] as const).map((h) => (
            <div key={h} className="flex flex-col items-start gap-1">
              <div className="flex items-center gap-2">
                <HealthDot health={h} />
                <span className="text-2xl font-bold tabular-nums">{healthBreakdown[h]}</span>
              </div>
              <div className="text-xs text-muted-foreground">{h}</div>
            </div>
          ))}
        </div>
      </Card>

      <div className="h-4" />
      <QuickAddProspect open={quickAdd} onOpenChange={setQuickAdd} />
    </div>
  );
}
