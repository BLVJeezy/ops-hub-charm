import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ServiceMonth } from "@/lib/invoice-schedule";
import { formatCurrency } from "@/lib/format";

export const SERVICE_COLS = [
  { key: "seo", label: "SEO", color: "#38bdf8" },
  { key: "website", label: "Websites", color: "#d6b25e" },
  { key: "social", label: "Social media", color: "#a78bfa" },
] as const;

export const monthLabel = (m: string) => new Date(m + "-15").toLocaleDateString("nl-BE", { month: "short" });

/** Stacked bars: what will be invoiced per month, split by service. */
export function ForecastChart({ rows, height = 220 }: { rows: ServiceMonth[]; height?: number }) {
  const data = rows.map((r) => ({ ...r, name: monthLabel(r.month) }));
  return (
    <div style={{ height }} role="img" aria-label="Projectie per maand en per dienst">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 6, right: 4, left: 0, bottom: 0 }} barCategoryGap="28%">
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={44} axisLine={false} tickLine={false} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))} />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
            contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }}
            formatter={(v: number, k: string) => [formatCurrency(v), SERVICE_COLS.find((c) => c.key === k)?.label ?? k]}
          />
          {SERVICE_COLS.map((c, i) => (
            <Bar key={c.key} dataKey={c.key} stackId="a" fill={c.color} radius={i === SERVICE_COLS.length - 1 ? [5, 5, 0, 0] : 0} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ForecastLegend() {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      {SERVICE_COLS.map((c) => <span key={c.key} className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />{c.label}</span>)}
    </div>
  );
}
