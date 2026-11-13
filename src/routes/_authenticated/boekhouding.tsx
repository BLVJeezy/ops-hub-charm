import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Download, Lock, LockOpen, Plus, RefreshCw, Scale, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminOnly } from "@/components/RoleGate";
import { supabase } from "@/integrations/supabase/client";
import {
  balanceOf, change, journalCsv, periodOf, profitAndLoss, sameLastYear, shiftPeriod, trialBalance,
  type Account, type AccountType, type Entry, type Line, type Period, type PeriodKind,
} from "@/lib/ledger";
import { todayISO } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/boekhouding")({
  component: () => (
    <AdminOnly fallback={<div className="p-6 text-sm text-muted-foreground">Alleen admins hebben toegang tot de boekhouding.</div>}>
      <Bookkeeping />
    </AdminOnly>
  ),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const eur = (n: number) => new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" }).format(Number(n) || 0);
const TYPE_LABEL: Record<AccountType, string> = { asset: "Activa", liability: "Schulden", equity: "Eigen vermogen", income: "Opbrengsten", expense: "Kosten" };
const SOURCE_LABEL: Record<string, string> = { invoice: "Factuur", payment: "Betaling", expense: "Kost", manual: "Manueel" };
type PeriodRow = { month: string; locked_at: string | null };

// PostgREST returns at most 1000 rows per request: page through everything.
async function fetchAll<T>(table: string, order: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select("*").order(order).range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

function Bookkeeping() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [periods, setPeriods] = useState<PeriodRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [kind, setKind] = useState<PeriodKind>("month");
  const [anchor, setAnchor] = useState(todayISO());
  const [newEntry, setNewEntry] = useState(false);

  const load = useCallback(async () => {
    try {
      const [a, e, l, p] = await Promise.all([
        fetchAll<Account>("ledger_accounts", "code"), fetchAll<Entry>("journal_entries", "date"),
        fetchAll<Line>("journal_lines", "id"), fetchAll<PeriodRow>("ledger_periods", "month"),
      ]);
      setAccounts(a); setEntries(e.sort((x, y) => (y.date + (y.created_at ?? "")).localeCompare(x.date + (x.created_at ?? "")))); setLines(l); setPeriods(p);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Laden mislukt");
    }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const sync = async () => {
    setSyncing(true);
    const { data, error } = await db.rpc("ledger_sync");
    setSyncing(false);
    if (error) return toast.error(error.message);
    toast.success(`Geboekt: ${data.created} nieuw, ${data.updated} aangepast, ${data.removed} verwijderd${data.skipped_locked ? `, ${data.skipped_locked} in afgesloten periodes overgeslagen` : ""}`);
    load();
  };

  const P = useMemo(() => periodOf(kind, anchor), [kind, anchor]);
  if (loading) return <div className="p-6 text-sm text-muted-foreground">Laden…</div>;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2"><BookOpen className="w-7 h-7" /> Boekhouding</h1>
          <p className="text-xs text-muted-foreground">Dubbel boekhouden · facturen en kosten worden automatisch geboekt (elke nacht, of met de knop).</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={sync} disabled={syncing}><RefreshCw className={`w-4 h-4 mr-1 ${syncing ? "animate-spin" : ""}`} />Synchroniseren</Button>
          <Button onClick={() => setNewEntry(true)}><Plus className="w-4 h-4 mr-1" />Boeking</Button>
        </div>
      </div>

      <PeriodPicker P={P} kind={kind} setKind={setKind} setAnchor={setAnchor} />

      <Tabs defaultValue="overzicht">
        <TabsList className="w-full grid grid-cols-5">
          <TabsTrigger value="overzicht" className="text-xs">Overzicht</TabsTrigger>
          <TabsTrigger value="dagboek" className="text-xs">Dagboek</TabsTrigger>
          <TabsTrigger value="rekeningen" className="text-xs">Rekeningen</TabsTrigger>
          <TabsTrigger value="periodes" className="text-xs">Periodes</TabsTrigger>
          <TabsTrigger value="export" className="text-xs">Export</TabsTrigger>
        </TabsList>
        <TabsContent value="overzicht"><Overview P={P} accounts={accounts} entries={entries} lines={lines} /></TabsContent>
        <TabsContent value="dagboek"><Journal P={P} accounts={accounts} entries={entries} lines={lines} periods={periods} onChange={load} /></TabsContent>
        <TabsContent value="rekeningen"><Accounts P={P} accounts={accounts} entries={entries} lines={lines} onChange={load} /></TabsContent>
        <TabsContent value="periodes"><Periods accounts={accounts} entries={entries} lines={lines} periods={periods} onChange={load} /></TabsContent>
        <TabsContent value="export"><Exports P={P} accounts={accounts} entries={entries} lines={lines} /></TabsContent>
      </Tabs>

      <NewEntryDialog open={newEntry} onClose={() => setNewEntry(false)} accounts={accounts} onSaved={load} />
    </div>
  );
}

function PeriodPicker({ P, kind, setKind, setAnchor }: { P: Period; kind: PeriodKind; setKind: (k: PeriodKind) => void; setAnchor: (d: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-full border border-border p-0.5">
        {(["month", "quarter", "year"] as PeriodKind[]).map((k) => (
          <button key={k} onClick={() => setKind(k)} className={`px-3 h-8 rounded-full text-xs ${kind === k ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
            {k === "month" ? "Maand" : k === "quarter" ? "Kwartaal" : "Jaar"}
          </button>
        ))}
      </div>
      <div className="inline-flex items-center gap-1">
        <Button size="sm" variant="outline" onClick={() => setAnchor(shiftPeriod(P, -1).from)}>‹</Button>
        <span className="text-sm font-medium w-28 text-center capitalize">{P.label}</span>
        <Button size="sm" variant="outline" onClick={() => setAnchor(shiftPeriod(P, 1).from)}>›</Button>
      </div>
    </div>
  );
}

type Data = { P: Period; accounts: Account[]; entries: Entry[]; lines: Line[] };

function Delta({ v }: { v: number | null }) {
  if (v === null) return <span className="text-muted-foreground">—</span>;
  return <span className={v >= 0 ? "text-emerald-500" : "text-red-500"}>{v >= 0 ? "▲" : "▼"} {Math.abs(v)}%</span>;
}

function Overview({ P, accounts, entries, lines }: Data) {
  const prev = shiftPeriod(P, -1), ly = sameLastYear(P);
  const now = profitAndLoss(accounts, entries, lines, P);
  const a = profitAndLoss(accounts, entries, lines, prev);
  const b = profitAndLoss(accounts, entries, lines, ly);
  const tb = trialBalance(accounts, entries, lines, P.to);
  const bal = (key: string) => tb.rows.find((r) => r.account.system_key === key)?.balance ?? 0;
  const chart = Array.from({ length: 6 }, (_, i) => {
    const p = shiftPeriod(P, i - 5), x = profitAndLoss(accounts, entries, lines, p);
    return { name: p.label, Opbrengsten: x.income, Kosten: x.expense };
  });
  const pl = accounts.filter((x) => x.type === "income" || x.type === "expense");
  return (
    <div className="space-y-4 mt-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Kpi label="Opbrengsten" value={eur(now.income)} sub={<><Delta v={change(now.income, a.income)} /> vs {prev.label}</>} />
        <Kpi label="Kosten" value={eur(now.expense)} sub={<><Delta v={change(now.expense, a.expense)} /> vs {prev.label}</>} />
        <Kpi label="Resultaat" value={eur(now.result)} tone={now.result >= 0 ? "pos" : "neg"} sub={<><Delta v={change(now.result, b.result)} /> vs {ly.label}</>} />
        <Kpi label="Openstaand bij klanten" value={eur(bal("debtors"))} sub={<>bank {eur(bal("bank"))}</>} />
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="text-xs font-semibold tracking-[0.15em] text-muted-foreground uppercase mb-2">Laatste 6 periodes</div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip formatter={(v: number) => eur(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
              <Bar dataKey="Opbrengsten" fill="#C9A14A" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Kosten" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b border-border"><th className="text-left p-3">Resultatenrekening</th><th className="text-right p-3 capitalize">{P.label}</th><th className="text-right p-3 capitalize">{prev.label}</th><th className="text-right p-3 capitalize">{ly.label}</th></tr>
          </thead>
          <tbody>
            {(["income", "expense"] as const).map((t) => (
              <PlGroup key={t} type={t} accounts={pl.filter((x) => x.type === t)} cols={[now, a, b]} />
            ))}
            <tr className="font-semibold border-t border-border">
              <td className="p-3">Resultaat</td>
              {[now, a, b].map((x, i) => <td key={i} className={`p-3 text-right ${x.result < 0 ? "text-red-500" : ""}`}>{eur(x.result)}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
      <p className={`text-xs flex items-center gap-1 ${tb.balanced ? "text-emerald-500" : "text-red-500"}`}>
        <Scale className="w-3.5 h-3.5" /> Proefbalans t/m {P.to}: debet {eur(tb.debit)} · credit {eur(tb.credit)} {tb.balanced ? "· in evenwicht" : "· NIET in evenwicht"}
      </p>
    </div>
  );
}

function PlGroup({ type, accounts, cols }: { type: "income" | "expense"; accounts: Account[]; cols: ReturnType<typeof profitAndLoss>[] }) {
  const rows = accounts.filter((a) => cols.some((c) => c.byAccount[a.id]));
  return (
    <>
      <tr className="bg-muted/30"><td colSpan={4} className="px-3 py-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">{TYPE_LABEL[type]}</td></tr>
      {rows.length ? rows.map((a) => (
        <tr key={a.id} className="border-b border-border/50">
          <td className="p-3"><span className="font-mono text-xs text-muted-foreground mr-2">{a.code}</span>{a.name}</td>
          {cols.map((c, i) => <td key={i} className="p-3 text-right tabular-nums">{c.byAccount[a.id] ? eur(c.byAccount[a.id]) : "—"}</td>)}
        </tr>
      )) : <tr><td colSpan={4} className="p-3 text-xs text-muted-foreground">Geen boekingen.</td></tr>}
      <tr className="text-xs"><td className="px-3 py-1.5 text-muted-foreground">Totaal {TYPE_LABEL[type].toLowerCase()}</td>
        {cols.map((c, i) => <td key={i} className="px-3 py-1.5 text-right tabular-nums">{eur(type === "income" ? c.income : c.expense)}</td>)}</tr>
    </>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: React.ReactNode; tone?: "pos" | "neg" }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <div className={`text-xl font-bold tabular-nums ${tone === "neg" ? "text-red-500" : tone === "pos" ? "text-emerald-500" : ""}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      {sub && <div className="text-[11px] mt-1">{sub}</div>}
    </div>
  );
}

function Journal({ P, accounts, entries, lines, periods, onChange }: Data & { periods: PeriodRow[]; onChange: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [src, setSrc] = useState("");
  const acc = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const byEntry = useMemo(() => { const m = new Map<string, Line[]>(); for (const l of lines) { const x = m.get(l.entry_id) ?? []; x.push(l); m.set(l.entry_id, x); } return m; }, [lines]);
  const locked = (d: string) => periods.some((p) => p.locked_at && p.month === d.slice(0, 7) + "-01");
  const shown = entries.filter((e) => e.date >= P.from && e.date <= P.to && (!src || e.source === src));
  const del = async (e: Entry) => {
    if (!confirm(`Boeking "${e.description}" verwijderen?`)) return;
    const { error } = await db.from("journal_entries").delete().eq("id", e.id);
    if (error) return toast.error(error.message);
    toast.success("Verwijderd"); onChange();
  };
  return (
    <div className="mt-3 space-y-2">
      <div className="flex gap-1.5 flex-wrap">
        {["", "invoice", "payment", "expense", "manual"].map((s) => (
          <button key={s} onClick={() => setSrc(s)} className={`text-xs px-2.5 py-1 rounded-full border ${src === s ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}>
            {s ? SOURCE_LABEL[s] : "Alles"}
          </button>
        ))}
      </div>
      <div className="rounded-2xl border border-border bg-card divide-y divide-border">
        {shown.map((e) => {
          const ls = byEntry.get(e.id) ?? [], amt = balanceOf(ls).debit;
          return (
            <div key={e.id}>
              <button onClick={() => setOpen(open === e.id ? null : e.id)} className="w-full flex items-center gap-3 p-3 text-left text-sm hover:bg-muted/40">
                <span className="text-xs text-muted-foreground w-20 shrink-0">{e.date.split("-").reverse().join("-")}</span>
                <span className="flex-1 truncate">{e.description}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{SOURCE_LABEL[e.source] ?? e.source}</span>
                {locked(e.date) && <Lock className="w-3 h-3 text-muted-foreground" />}
                <span className="tabular-nums w-24 text-right">{eur(amt)}</span>
              </button>
              {open === e.id && (
                <div className="px-3 pb-3">
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground"><tr><th className="text-left py-1">Rekening</th><th className="text-right">Debet</th><th className="text-right">Credit</th><th className="text-left pl-3">Btw</th></tr></thead>
                    <tbody>{ls.map((l) => (
                      <tr key={l.id}><td className="py-1"><span className="font-mono text-muted-foreground mr-1">{acc.get(l.account_id)?.code}</span>{acc.get(l.account_id)?.name}{l.memo ? ` · ${l.memo}` : ""}</td>
                        <td className="text-right tabular-nums">{l.debit ? eur(l.debit) : ""}</td><td className="text-right tabular-nums">{l.credit ? eur(l.credit) : ""}</td><td className="pl-3">{l.vat_code ?? ""}</td></tr>
                    ))}</tbody>
                  </table>
                  {e.source === "manual" && !locked(e.date) && (
                    <Button size="sm" variant="ghost" className="mt-1 text-red-500" onClick={() => del(e)}><Trash2 className="w-3.5 h-3.5 mr-1" />Verwijderen</Button>
                  )}
                  {e.source !== "manual" && <p className="text-[11px] text-muted-foreground mt-1">Automatische boeking: pas de factuur of kost aan en synchroniseer.</p>}
                </div>
              )}
            </div>
          );
        })}
        {!shown.length && <p className="p-3 text-sm text-muted-foreground">Geen boekingen in deze periode.</p>}
      </div>
    </div>
  );
}

function Accounts({ P, accounts, entries, lines, onChange }: Data & { onChange: () => void }) {
  const tb = trialBalance(accounts, entries, lines, P.to);
  const bal = new Map(tb.rows.map((r) => [r.account.id, r.balance]));
  const [f, setF] = useState({ code: "", name: "", type: "expense" as AccountType });
  const add = async () => {
    if (!/^\d{3,6}$/.test(f.code) || !f.name.trim()) return toast.error("Code (cijfers) en naam zijn verplicht");
    const { error } = await db.from("ledger_accounts").insert({ code: f.code, name: f.name.trim(), type: f.type });
    if (error) return toast.error(error.message);
    setF({ code: "", name: "", type: f.type }); toast.success("Rekening toegevoegd"); onChange();
  };
  return (
    <div className="mt-3 space-y-3">
      {(Object.keys(TYPE_LABEL) as AccountType[]).map((t) => (
        <div key={t} className="rounded-2xl border border-border bg-card">
          <div className="px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border">{TYPE_LABEL[t]}</div>
          {accounts.filter((a) => a.type === t).map((a) => (
            <div key={a.id} className="flex items-center gap-3 px-3 py-2 text-sm border-b border-border/40 last:border-0">
              <span className="font-mono text-xs text-muted-foreground w-12">{a.code}</span>
              <span className="flex-1">{a.name}{a.system_key && <span className="ml-2 text-[10px] text-muted-foreground">auto</span>}</span>
              <span className="tabular-nums">{eur(bal.get(a.id) ?? 0)}</span>
            </div>
          ))}
        </div>
      ))}
      <div className="rounded-2xl border border-border bg-card p-3 flex flex-wrap gap-2 items-end">
        <input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder="Code" className="h-9 w-24 rounded-md border border-input bg-transparent px-2 text-sm" />
        <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Naam" className="h-9 flex-1 min-w-40 rounded-md border border-input bg-transparent px-2 text-sm" />
        <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as AccountType })} className="h-9 rounded-md border border-input bg-card px-2 text-sm">
          {(Object.keys(TYPE_LABEL) as AccountType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
        </select>
        <Button size="sm" onClick={add}><Plus className="w-4 h-4 mr-1" />Rekening</Button>
      </div>
      <p className="text-[11px] text-muted-foreground">Saldi t/m {P.to}. Het rekeningschema is een vertrekpunt: neem het schema van je boekhouder over voor een exacte export.</p>
    </div>
  );
}

function Periods({ accounts, entries, lines, periods, onChange }: Omit<Data, "P"> & { periods: PeriodRow[]; onChange: () => void }) {
  const months = Array.from({ length: 12 }, (_, i) => shiftPeriod(periodOf("month", todayISO()), -i));
  const lock = async (p: Period, on: boolean) => {
    if (on && !confirm(`${p.label} afsluiten? Boekingen in deze maand kunnen daarna niet meer wijzigen.`)) return;
    const { data: u } = await supabase.auth.getUser();
    const { error } = await db.from("ledger_periods").upsert({ month: p.from, locked_at: on ? new Date().toISOString() : null, locked_by: on ? u.user?.id : null });
    if (error) return toast.error(error.message);
    toast.success(on ? `${p.label} afgesloten` : `${p.label} heropend`); onChange();
  };
  return (
    <div className="mt-3 rounded-2xl border border-border bg-card divide-y divide-border">
      {months.map((p) => {
        const r = periods.find((x) => x.month === p.from), locked = !!r?.locked_at;
        const x = profitAndLoss(accounts, entries, lines, p);
        const n = entries.filter((e) => e.date >= p.from && e.date <= p.to).length;
        return (
          <div key={p.from} className="flex items-center gap-3 p-3 text-sm">
            <span className="w-24 capitalize font-medium">{p.label}</span>
            <span className="flex-1 text-xs text-muted-foreground">{n} boekingen · resultaat {eur(x.result)}</span>
            {locked ? (
              <Button size="sm" variant="outline" onClick={() => lock(p, false)}><Lock className="w-3.5 h-3.5 mr-1" />Afgesloten</Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => lock(p, true)}><LockOpen className="w-3.5 h-3.5 mr-1" />Afsluiten</Button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Exports({ P, accounts, entries, lines }: Data) {
  const download = (name: string, text: string) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }));
    a.download = name; a.click(); URL.revokeObjectURL(a.href);
  };
  const trial = () => {
    const tb = trialBalance(accounts, entries, lines, P.to);
    const n = (v: number) => v.toFixed(2).replace(".", ",");
    download(`saldibalans-${P.to}.csv`, ["rekening;naam;type;debet;credit;saldo", ...tb.rows.map((r) => `${r.account.code};"${r.account.name}";${r.account.type};${n(r.debit)};${n(r.credit)};${n(r.balance)}`)].join("\n"));
  };
  return (
    <div className="mt-3 grid sm:grid-cols-2 gap-3">
      <button onClick={() => download(`dagboek-${P.from}_${P.to}.csv`, journalCsv(accounts, entries, lines, P))} className="rounded-2xl border border-border bg-card p-4 text-left hover:bg-muted/40">
        <Download className="w-5 h-5 mb-2" /><div className="font-medium">Dagboek <span className="capitalize">{P.label}</span></div>
        <div className="text-xs text-muted-foreground">Alle boekingsregels van de periode (CSV, ; gescheiden, Excel-klaar)</div>
      </button>
      <button onClick={trial} className="rounded-2xl border border-border bg-card p-4 text-left hover:bg-muted/40">
        <Scale className="w-5 h-5 mb-2" /><div className="font-medium">Proef- en saldibalans t/m {P.to}</div>
        <div className="text-xs text-muted-foreground">Debet, credit en saldo per rekening (CSV)</div>
      </button>
      <p className="sm:col-span-2 text-[11px] text-muted-foreground">Exports zijn voor je boekhouder; Hub OS dient zelf geen aangiftes in. Bankkoppeling (Revolut) en het één-knop-rapport volgen in de volgende fases.</p>
    </div>
  );
}

function NewEntryDialog({ open, onClose, accounts, onSaved }: { open: boolean; onClose: () => void; accounts: Account[]; onSaved: () => void }) {
  const blank = () => ({ account_id: "", debit: "", credit: "", memo: "" });
  const [date, setDate] = useState(todayISO());
  const [desc, setDesc] = useState("");
  const [rows, setRows] = useState([blank(), blank()]);
  const [busy, setBusy] = useState(false);
  const bal = balanceOf(rows.map((r) => ({ debit: Number(r.debit.replace(",", ".")) || 0, credit: Number(r.credit.replace(",", ".")) || 0 })));
  const set = (i: number, k: keyof ReturnType<typeof blank>, v: string) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const save = async () => {
    if (!desc.trim()) return toast.error("Omschrijving ontbreekt");
    const ls = rows.filter((r) => r.account_id && (r.debit || r.credit)).map((r) => ({
      account_id: r.account_id, debit: Number(r.debit.replace(",", ".")) || 0, credit: Number(r.credit.replace(",", ".")) || 0, memo: r.memo,
    }));
    if (ls.length < 2 || !bal.ok) return toast.error("Debet en credit moeten gelijk zijn (minstens twee regels)");
    setBusy(true);
    const { error } = await db.rpc("ledger_post", { _date: date, _description: desc.trim(), _lines: ls });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Geboekt"); setDesc(""); setRows([blank(), blank()]); onClose(); onSaved();
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Nieuwe boeking</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 rounded-md border border-input bg-transparent px-2 text-sm" />
            <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Omschrijving (bv. Inbreng kapitaal, Bankkosten oktober)" className="h-9 flex-1 rounded-md border border-input bg-transparent px-2 text-sm" />
          </div>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_90px_90px_28px] gap-2">
              <select value={r.account_id} onChange={(e) => set(i, "account_id", e.target.value)} className="h-9 rounded-md border border-input bg-card px-2 text-sm">
                <option value="">Rekening…</option>
                {accounts.filter((a) => a.active).map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
              </select>
              <input value={r.debit} onChange={(e) => set(i, "debit", e.target.value)} placeholder="Debet" inputMode="decimal" className="h-9 rounded-md border border-input bg-transparent px-2 text-sm text-right" />
              <input value={r.credit} onChange={(e) => set(i, "credit", e.target.value)} placeholder="Credit" inputMode="decimal" className="h-9 rounded-md border border-input bg-transparent px-2 text-sm text-right" />
              <button onClick={() => setRows(rows.length > 2 ? rows.filter((_, j) => j !== i) : rows)} className="text-muted-foreground"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
          <div className="flex items-center justify-between">
            <Button size="sm" variant="ghost" onClick={() => setRows([...rows, blank()])}><Plus className="w-4 h-4 mr-1" />Regel</Button>
            <span className={`text-xs ${bal.ok ? "text-emerald-500" : "text-red-500"}`}>Debet {eur(bal.debit)} · Credit {eur(bal.credit)}{bal.ok ? " · in evenwicht" : ` · verschil ${eur(bal.diff)}`}</span>
          </div>
          <Button className="w-full" onClick={save} disabled={busy || !bal.ok}>Boeken</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
