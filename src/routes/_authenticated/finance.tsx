import { CurrencyToggle, useCurrency } from "@/components/CurrencyToggle";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/format";
import { clientAnnualProjection, clientMRR, type FeeClient } from "@/lib/fees";
import { BookOpen } from "lucide-react";

export const Route = createFileRoute("/_authenticated/finance")({
  component: Finance,
});

type Client = FeeClient & {
  id: string; name: string; status: string | null; pipeline_stage: string | null;
  health: string | null; renewal_date: string | null; next_followup_date: string | null;
};
type Invoice = { id: string; invoice_number: number; client: string | null; client_name: string | null; total: number; status: string; date: string };
type Expense = { id: string; monthly_cost: number; linked_client: string | null };

function Mini({ label, value, sub, good }: { label: string; value: string; sub?: string; good?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-muted-foreground truncate">{label}</div>
      <div className={`text-[15px] md:text-xl font-semibold tabular-nums truncate ${good ? "text-emerald-400" : ""}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground truncate">{sub}</div>}
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-border bg-card p-4 ${className}`}>{children}</div>;
}

function Finance() {
  useCurrency();
  const [clients, setClients] = useState<Client[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"paid" | "projection">("paid");

  async function load() {
    const [c, i, e] = await Promise.all([
      supabase.from("clients").select("*"),
      supabase.from("invoices").select("id,invoice_number,client,client_name,total,status,date"),
      supabase.from("expenses").select("id,monthly_cost,linked_client"),
    ]);
    setClients((c.data as unknown as Client[]) ?? []);
    setInvoices((i.data as unknown as Invoice[]) ?? []);
    setExpenses((e.data as unknown as Expense[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const ch = supabase.channel("finance")
      .on("postgres_changes", { event: "*", schema: "public", table: "clients" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, () => load())
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

  const revenuePerClient = useMemo(() => {
    const paidByClient: Record<string, number> = {};
    const norm = (name: string) => name.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
    const idByName = new Map(clients.map((client) => [norm(client.name), client.id]));
    invoices.filter((i) => i.status === "Paid").forEach((i) => {
      const clientId = i.client || (i.client_name ? idByName.get(norm(i.client_name)) : undefined);
      if (!clientId) return;
      paidByClient[clientId] = (paidByClient[clientId] || 0) + Number(i.total || 0);
    });
    return Object.entries(paidByClient)
      .map(([id, total]) => ({ id, total, name: clientById[id]?.name ?? "Unknown" }))
      .filter((row) => row.name !== "Unknown")
      .sort((a, b) => b.total - a.total);
  }, [invoices, clients, clientById]);

  const annualProjectionPerClient = useMemo(
    () => activeClients
      .map((client) => ({
        id: client.id,
        name: client.name,
        total: clientAnnualProjection(client),
      }))
      .filter((row) => row.total > 0)
      .sort((a, b) => b.total - a.total),
    [activeClients]
  );

  const now = new Date();
  const year = now.getFullYear();
  // Revenue report is based on paid invoices (by invoice date), same source as lifetime revenue.
  const revenueReport = useMemo(() => {
    const rows = Array.from({ length: 12 }, (_, m) => ({
      label: new Date(year, m, 1).toLocaleDateString("en", { month: "short" }),
      thisYear: 0,
      lastYear: 0,
    }));
    for (const inv of invoices) {
      if (inv.status !== "Paid" || !inv.date) continue;
      const [y, m] = inv.date.split("-").map(Number);
      if (!y || !m) continue;
      if (y === year) rows[m - 1].thisYear += Number(inv.total || 0);
      else if (y === year - 1) rows[m - 1].lastYear += Number(inv.total || 0);
    }
    return rows;
  }, [invoices, year]);

  const ytd = revenueReport.slice(0, now.getMonth() + 1).reduce((s, r) => s + r.thisYear, 0);
  const lastYearTotal = revenueReport.reduce((s, r) => s + r.lastYear, 0);
  const thisMonth = revenueReport[now.getMonth()].thisYear;
  const lastMonth = now.getMonth() === 0 ? revenueReport[11].thisYear : revenueReport[now.getMonth() - 1].thisYear;
  const momChange = lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : null;

  if (loading) return <div className="p-6 text-muted-foreground">Loading finance…</div>;

  const topPaid = revenuePerClient[0]?.total || 1;
  const topProj = annualProjectionPerClient[0]?.total || 1;
  const list = view === "paid" ? revenuePerClient : annualProjectionPerClient;
  const listTop = view === "paid" ? topPaid : topProj;
  const margin = mrr > 0 ? Math.round((netProfit / mrr) * 100) : null;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-2">
      <div className="flex items-center justify-between mb-2 md:mb-4">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Finance</h1>
        <CurrencyToggle />
      </div>

      {/* Hero: what came in, and what comes in every month */}
      <div className="tone tone-gold rounded-2xl border p-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-xs text-muted-foreground">Received from paid invoices</div>
            <div className="ink-gold text-[2.6rem] leading-none font-bold tracking-tight tabular-nums mt-1">
              {formatCurrency(lifetimeRevenue)}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-lg font-semibold tabular-nums leading-none">{formatCurrency(thisMonth)}</div>
            <div className="text-[11px] text-muted-foreground mt-1">
              this month
              {momChange !== null && (
                <span className={momChange >= 0 ? "text-emerald-400" : "text-red-400"}>
                  {" "}
                  {momChange >= 0 ? "▲" : "▼"} {Math.abs(momChange).toFixed(0)}%
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2 mt-4 pt-3 border-t border-white/10">
          <Mini label="MRR" value={formatCurrency(mrr)} sub={`${activeClients.length} clients`} />
          <Mini label="Net / month" value={formatCurrency(netProfit)} sub={margin !== null ? `${margin}% margin` : undefined} good={netProfit >= 0} />
          <Mini label="Yearly" value={formatCurrency(jrr)} sub="recurring" />
          <Mini label="Pipeline" value={formatCurrency(pipelineValue)} sub="in proposal" />
        </div>
      </div>

      {/* Who pays */}
      <Card>
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="text-sm font-medium">Revenue per client</div>
          <div className="inline-flex rounded-full bg-muted p-0.5 text-xs">
            {(["paid", "projection"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-full px-3 min-h-8 transition ${view === v ? "bg-white text-black" : "text-muted-foreground"}`}
              >
                {v === "paid" ? "Paid" : "Per year"}
              </button>
            ))}
          </div>
        </div>
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {view === "paid" ? "No paid invoices yet." : "No recurring client revenue yet."}
          </p>
        ) : (
          <ul className={`space-y-2.5 ${view === "paid" ? "tone-gold" : "tone-violet"}`}>
            {list.map((t) => (
              <li key={t.id}>
                <Link to="/clients/$id" params={{ id: t.id }} className="block">
                  <div className="flex items-baseline justify-between text-sm gap-3">
                    <span className="truncate">{t.name}</span>
                    <span className="tabular-nums font-medium shrink-0">{formatCurrency(t.total)}</span>
                  </div>
                  <div className="meter mt-1">
                    <i style={{ width: `${Math.max(3, (t.total / listTop) * 100)}%` }} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Year view */}
      <Card>
        <div className="grid grid-cols-3 gap-2 mb-2">
          <Mini label={`${year} so far`} value={formatCurrency(ytd)} />
          <Mini label={`${year - 1} total`} value={formatCurrency(lastYearTotal)} />
          <Mini label="Last month" value={formatCurrency(lastMonth)} />
        </div>
        <div className="h-36 md:h-64 -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={revenueReport} barGap={1}>
              <defs>
                <linearGradient id="finGold" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f0d489" />
                  <stop offset="100%" stopColor="#a8792b" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} axisLine={false} tickLine={false} interval={0} tickFormatter={(v: string) => v.slice(0, 1)} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => formatCurrency(v)} axisLine={false} tickLine={false} width={52} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                formatter={(v: number) => formatCurrency(v)}
                cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }}
              />
              <Bar name={`${year - 1}`} dataKey="lastYear" fill="#3f3f46" radius={[2, 2, 0, 0]} />
              <Bar name={`${year}`} dataKey="thisYear" fill="url(#finGold)" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex gap-4 text-[11px] text-muted-foreground mt-1">
          <span className="inline-flex items-center gap-1.5"><i className="w-2 h-2 rounded-sm" style={{ background: "#d6b25e" }} /> {year}</span>
          <span className="inline-flex items-center gap-1.5"><i className="w-2 h-2 rounded-sm bg-zinc-700" /> {year - 1}</span>
        </div>
      </Card>

      <Link to="/boekhouding" className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 hover:border-white/20 transition">
        <BookOpen className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="min-w-0">
          <div className="text-sm font-medium">Boekhouding</div>
          <div className="text-xs text-muted-foreground truncate">Grootboek, resultatenrekening en exports</div>
        </div>
      </Link>

      <div className="h-4" />
    </div>
  );
}
