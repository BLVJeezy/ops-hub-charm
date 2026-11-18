import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/format";
import { costLines, lastMonths, monthTotal, passedOn, type CostTx } from "@/lib/expense-months";

const MONTHS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const LONG = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
const label = (m: string, long = false) => `${(long ? LONG : MONTHS)[Number(m.slice(5)) - 1]}${long ? ` ${m.slice(0, 4)}` : ""}`;

/** What everything really cost, month by month, from the imported bank statements. */
export function MonthlyCosts() {
  const [txs, setTxs] = useState<CostTx[] | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  useEffect(() => {
    const from = new Date(Date.UTC(new Date().getUTCFullYear() - 1, new Date().getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
    // the bookkeeping tables are not in the generated types, as on the Boekhouding page
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("bank_transactions").select("date, amount, description, ledger_accounts:category_account_id(name)").lt("amount", 0).gte("date", from).order("date")
      .then(({ data }: { data: unknown }) => setTxs(((data ?? []) as unknown as { date: string; amount: number; description: string; ledger_accounts: { name: string } | null }[])
        .map((t) => ({ date: t.date, amount: Number(t.amount), description: t.description ?? "", account: t.ledger_accounts?.name ?? null }))));
  }, []);
  const last = txs?.length ? txs[txs.length - 1].date.slice(0, 7) : null;
  const months = useMemo(() => (last ? lastMonths(last, 12) : []), [last]);
  const lines = useMemo(() => (txs ? costLines(txs, months) : []), [txs, months]);
  if (!txs) return <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">Kosten per maand laden…</div>;
  if (!lines.length || !last) return null;
  // the latest month is often still running, so open on the one before it
  const sel = pick ?? months[months.length - 2] ?? last;
  const totals = months.map((m) => monthTotal(lines, m)), max = Math.max(...totals, 1);
  const shown = lines.filter((l) => (l.months[sel] ?? 0) > 0).sort((a, b) => (b.months[sel] ?? 0) - (a.months[sel] ?? 0));
  const full = months.slice(0, -1), avg = full.length ? full.reduce((s, m) => s + monthTotal(lines, m), 0) / full.length : 0;
  const selTotal = monthTotal(lines, sel);
  return (
    <section className="rounded-xl border border-border bg-card p-3.5 mt-3" aria-label="Kosten per maand">
      <h2 className="font-semibold">Kosten per maand</h2>
      <p className="text-[11px] text-muted-foreground">Uit je bankrekening, zonder je eigen opnames en zonder wat je doorbetaalt aan Les Autres. Tik op een maand.</p>
      <div className="flex items-end gap-1 h-28 mt-3" role="group" aria-label="Kies een maand">
        {months.map((m, i) => (
          <button key={m} type="button" onClick={() => setPick(m)} aria-pressed={m === sel} aria-label={`${label(m, true)}: ${formatCurrency(totals[i])}`}
            className="press flex-1 h-full flex flex-col justify-end items-center gap-1 min-w-0">
            <span className={`w-full rounded-t-md transition-colors ${m === sel ? "bg-amber-400" : "bg-muted-foreground/30 hover:bg-muted-foreground/50"}`} style={{ height: `${Math.max(3, (totals[i] / max) * 100)}%` }} />
            <span className={`text-[10px] leading-none ${m === sel ? "font-semibold" : "text-muted-foreground"}`}>{label(m)}</span>
          </button>
        ))}
      </div>
      <div className="flex items-end justify-between gap-3 mt-4 border-t border-border pt-3">
        <div>
          <div className="text-xs text-muted-foreground capitalize">{label(sel, true)}{sel === last ? " (loopt nog)" : ""}</div>
          <div className="text-2xl font-bold tabular-nums leading-tight">{formatCurrency(selTotal)}</div>
        </div>
        {avg > 0 && <div className="text-right text-[11px] text-muted-foreground">gemiddeld per maand<br /><span className="text-foreground tabular-nums text-sm font-semibold">{formatCurrency(avg)}</span></div>}
      </div>
      <ul className="divide-y divide-border mt-2">
        {shown.map((l) => {
          const v = l.months[sel] ?? 0, a = full.reduce((s, m) => s + (l.months[m] ?? 0), 0) / Math.max(1, full.length);
          return (
            <li key={l.group + l.name} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{l.name}</div>
                <div className="text-[11px] text-muted-foreground truncate">{l.name === l.group ? "" : `${l.group} · `}gem. {formatCurrency(a)}</div>
              </div>
              <div className="tabular-nums font-semibold text-sm">{formatCurrency(v)}</div>
            </li>
          );
        })}
      </ul>
      {passedOn(txs, sel).map((p) => (
        <p key={p.client} className="text-[11px] text-muted-foreground border-t border-border pt-2 mt-1">
          Doorbetaald aan {p.client}: <span className="tabular-nums text-foreground">{formatCurrency(p.amount)}</span>. Geen kost: dat is hun geld, Solyn houdt een commissie.
        </p>
      ))}
    </section>
  );
}
