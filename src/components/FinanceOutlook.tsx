import { useEffect, useMemo, useState } from "react";
import { formatCurrency } from "@/lib/format";
import { brusselsToday, forecastByService, type ForecastInvoice } from "@/lib/invoice-schedule";
import { DEFAULT_BUFFER, outlook, outlookTotals, type CostBuffer } from "@/lib/finance-outlook";

const KEY = "finance-outlook";
type Saved = { months: 6 | 12; buffer: CostBuffer };

function load(): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null");
    if (s && (s.months === 6 || s.months === 12) && s.buffer) return s;
  } catch {
    /* no storage: defaults */
  }
  return { months: 6, buffer: DEFAULT_BUFFER };
}

const eur = (n: number) => formatCurrency(Math.round(n));
const range = (a: number, b: number) => (Math.round(a) === Math.round(b) ? eur(a) : `${eur(a)} – ${eur(b)}`);

/** Revenue vs costs vs profit for the next 6 or 12 months, with costs (and so profit) as a range. */
export function FinanceOutlook({ invoices, fixedMonthly }: { invoices: unknown[]; fixedMonthly: number }) {
  const [state, setState] = useState<Saved>({ months: 6, buffer: DEFAULT_BUFFER });
  useEffect(() => setState(load()), []);
  const save = (s: Saved) => {
    setState(s);
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      /* ignore */
    }
  };
  const rows = useMemo(() => {
    const months = forecastByService(invoices as ForecastInvoice[], brusselsToday(), state.months).slice(1);
    return outlook(months, fixedMonthly, state.buffer);
  }, [invoices, fixedMonthly, state]);
  const t = outlookTotals(rows);
  const maxRev = Math.max(1, ...rows.map((r) => Math.max(r.revenue, r.costHigh)));
  const num = (v: string) => Math.max(0, Math.min(100000, Number(v) || 0));

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <div className="text-sm font-medium">Omzet, kosten en winst</div>
          <div className="text-xs text-muted-foreground">volgende {state.months} maanden · geplande facturen, excl. btw, vóór belasting</div>
        </div>
        <div className="flex rounded-full border border-border p-0.5 shrink-0">
          {([6, 12] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => save({ ...state, months: m })}
              className={`h-8 px-3 rounded-full text-xs font-medium ${state.months === m ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              {m} mnd
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-muted/40 p-3">
          <div className="text-[11px] text-muted-foreground">Omzet</div>
          <div className="text-lg lg:text-2xl font-bold tabular-nums">{eur(t.revenue)}</div>
          <div className="text-[11px] text-muted-foreground">{eur(t.revenue / rows.length)}/mnd</div>
        </div>
        <div className="rounded-xl bg-muted/40 p-3">
          <div className="text-[11px] text-muted-foreground">Kosten</div>
          <div className="text-base lg:text-2xl font-bold tabular-nums text-red-400 leading-tight">{range(t.costLow, t.costHigh)}</div>
          <div className="text-[11px] text-muted-foreground">{range(t.costLow / rows.length, t.costHigh / rows.length)}/mnd</div>
        </div>
        <div className="rounded-xl bg-muted/40 p-3">
          <div className="text-[11px] text-muted-foreground">Winst</div>
          <div className={`text-base lg:text-2xl font-bold tabular-nums leading-tight ${t.profitLow >= 0 ? "text-emerald-400" : "text-amber-400"}`}>{range(t.profitLow, t.profitHigh)}</div>
          <div className="text-[11px] text-muted-foreground">{range(t.profitLow / rows.length, t.profitHigh / rows.length)}/mnd</div>
        </div>
      </div>

      <table className="w-full text-sm mt-4">
        <thead>
          <tr className="text-[11px] text-muted-foreground">
            <th className="text-left font-normal py-1.5 pr-2">Maand</th>
            <th className="text-right font-normal py-1.5 px-2">Omzet</th>
            <th className="text-right font-normal py-1.5 px-2">Kosten</th>
            <th className="text-right font-normal py-1.5 pl-2">Winst</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.month} className="border-t border-border align-top">
              <td className="py-2 pr-2 whitespace-nowrap capitalize">
                {new Date(r.month + "-15").toLocaleDateString("nl-BE", { month: "short", year: "2-digit" })}
                <div className="mt-1.5 h-1.5 w-16 sm:w-28 rounded-full bg-muted overflow-hidden flex" aria-hidden>
                  <span className="bg-red-400/70" style={{ width: `${(Math.min(r.costHigh, r.revenue || r.costHigh) / maxRev) * 100}%` }} />
                  <span className="bg-emerald-400/80" style={{ width: `${(Math.max(0, r.profitLow) / maxRev) * 100}%` }} />
                </div>
              </td>
              <td className="py-2 px-2 text-right tabular-nums">{eur(r.revenue)}</td>
              <td className="py-2 px-2 text-right tabular-nums text-muted-foreground text-xs sm:text-sm">{range(r.costLow, r.costHigh)}</td>
              <td className={`py-2 pl-2 text-right tabular-nums font-semibold text-xs sm:text-sm ${r.profitLow >= 0 ? "" : "text-amber-400"}`}>{range(r.profitLow, r.profitHigh)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <details className="mt-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer py-1">Hoe de schatting werkt · bijkomende kosten aanpassen</summary>
        <p className="mt-2 leading-relaxed">
          Laagste kosten = je vaste maandkosten ({eur(fixedMonthly)}). Hoogste kosten = vaste kosten + een marge voor prijsstijgingen
          en extra credits, + een vast bedrag per maand voor onverwachte dingen (domeinen, hardware, een nieuwe tool).
          Omzet = de facturen die al ingepland staan; nieuwe klanten zitten er nog niet in. Belastingen en sociale bijdragen zijn niet afgetrokken.
        </p>
        <div className="mt-3 flex flex-wrap gap-4">
          <label className="flex items-center gap-2">
            Marge op vaste kosten
            <input type="number" inputMode="numeric" min={0} max={200} value={state.buffer.pct}
              onChange={(e) => save({ ...state, buffer: { ...state.buffer, pct: num(e.target.value) } })}
              className="w-16 h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground" />%
          </label>
          <label className="flex items-center gap-2">
            Onverwacht per maand €
            <input type="number" inputMode="numeric" min={0} value={state.buffer.perMonth}
              onChange={(e) => save({ ...state, buffer: { ...state.buffer, perMonth: num(e.target.value) } })}
              className="w-20 h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground" />
          </label>
        </div>
      </details>
    </div>
  );
}
