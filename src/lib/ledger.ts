/** Bookkeeping helpers (pure): periods, comparisons, profit & loss, trial balance, CSV. */

export type AccountType = "asset" | "liability" | "equity" | "income" | "expense";
export type Account = { id: string; code: string; name: string; type: AccountType; system_key: string | null; active: boolean };
export type Line = { id?: string; entry_id: string; account_id: string; debit: number; credit: number; client_id?: string | null; vat_code?: string | null; memo?: string | null };
export type Entry = { id: string; date: string; description: string; source: string; source_id: string | null; created_at?: string };
export type PeriodKind = "month" | "quarter" | "year";
export type Period = { kind: PeriodKind; from: string; to: string; label: string };

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const MONTHS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

/** The period of `kind` that contains `date` (YYYY-MM-DD). */
export function periodOf(kind: PeriodKind, date: string): Period {
  const y = Number(date.slice(0, 4)), m = Number(date.slice(5, 7));
  if (kind === "year") return { kind, from: iso(y, 1, 1), to: iso(y, 12, 31), label: String(y) };
  if (kind === "quarter") {
    const q = Math.floor((m - 1) / 3), m0 = q * 3 + 1;
    return { kind, from: iso(y, m0, 1), to: iso(y, m0 + 2, lastDay(y, m0 + 2)), label: `Q${q + 1} ${y}` };
  }
  return { kind, from: iso(y, m, 1), to: iso(y, m, lastDay(y, m)), label: `${MONTHS[m - 1]} ${y}` };
}

/** Shift a period by n units of its own kind (n = -1 → the previous one). */
export function shiftPeriod(p: Period, n: number): Period {
  const y = Number(p.from.slice(0, 4)), m = Number(p.from.slice(5, 7));
  const step = p.kind === "year" ? 12 : p.kind === "quarter" ? 3 : 1;
  const t = (y * 12 + (m - 1)) + n * step;
  return periodOf(p.kind, iso(Math.floor(t / 12), (t % 12) + 1, 1));
}
export const sameLastYear = (p: Period) => shiftPeriod(p, p.kind === "year" ? -1 : p.kind === "quarter" ? -4 : -12);

export const inPeriod = (date: string, p: Period) => date >= p.from && date <= p.to;

/** Signed balance of an account: debit-positive for assets/expenses, credit-positive for the rest. */
export function signed(type: AccountType, debit: number, credit: number) {
  return type === "asset" || type === "expense" ? debit - credit : credit - debit;
}

export type PnL = { income: number; expense: number; result: number; byAccount: Record<string, number> };
export function profitAndLoss(accounts: Account[], entries: Entry[], lines: Line[], p: Period): PnL {
  const acc = new Map(accounts.map((a) => [a.id, a]));
  const ent = new Map(entries.map((e) => [e.id, e]));
  const byAccount: Record<string, number> = {};
  let income = 0, expense = 0;
  for (const l of lines) {
    const e = ent.get(l.entry_id), a = acc.get(l.account_id);
    if (!e || !a || !inPeriod(e.date, p)) continue;
    if (a.type !== "income" && a.type !== "expense") continue;
    const v = signed(a.type, Number(l.debit) || 0, Number(l.credit) || 0);
    byAccount[a.id] = round2((byAccount[a.id] ?? 0) + v);
    if (a.type === "income") income += v; else expense += v;
  }
  return { income: round2(income), expense: round2(expense), result: round2(income - expense), byAccount };
}

/** Balance of every account up to and including `to` (trial balance / saldibalans). */
export function trialBalance(accounts: Account[], entries: Entry[], lines: Line[], to: string) {
  const ent = new Map(entries.map((e) => [e.id, e]));
  const t = new Map<string, { debit: number; credit: number }>();
  for (const l of lines) {
    const e = ent.get(l.entry_id);
    if (!e || e.date > to) continue;
    const x = t.get(l.account_id) ?? { debit: 0, credit: 0 };
    x.debit += Number(l.debit) || 0; x.credit += Number(l.credit) || 0; t.set(l.account_id, x);
  }
  const rows = accounts.map((a) => {
    const x = t.get(a.id) ?? { debit: 0, credit: 0 };
    return { account: a, debit: round2(x.debit), credit: round2(x.credit), balance: round2(signed(a.type, x.debit, x.credit)) };
  }).filter((r) => r.debit || r.credit);
  const debit = round2(rows.reduce((s, r) => s + r.debit, 0)), credit = round2(rows.reduce((s, r) => s + r.credit, 0));
  return { rows, debit, credit, balanced: Math.abs(debit - credit) < 0.005 };
}

/** % change, null when there is nothing to compare with. */
export function change(now: number, before: number): number | null {
  if (!before) return null;
  return Math.round(((now - before) / Math.abs(before)) * 1000) / 10;
}

export function balanceOf(lines: Array<Pick<Line, "debit" | "credit">>) {
  const d = round2(lines.reduce((s, l) => s + (Number(l.debit) || 0), 0));
  const c = round2(lines.reduce((s, l) => s + (Number(l.credit) || 0), 0));
  return { debit: d, credit: c, diff: round2(d - c), ok: d > 0 && Math.abs(d - c) < 0.005 };
}

export function journalCsv(accounts: Account[], entries: Entry[], lines: Line[], p: Period) {
  const acc = new Map(accounts.map((a) => [a.id, a]));
  const ent = new Map(entries.map((e) => [e.id, e]));
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const num = (n: number) => (Number(n) || 0).toFixed(2).replace(".", ",");
  const rows = lines
    .map((l) => ({ l, e: ent.get(l.entry_id), a: acc.get(l.account_id) }))
    .filter((r) => r.e && r.a && inPeriod(r.e.date, p))
    .sort((x, y) => (x.e!.date + x.e!.id).localeCompare(y.e!.date + y.e!.id));
  const head = ["datum", "boeking", "omschrijving", "bron", "rekening", "rekeningnaam", "debet", "credit", "btw-code", "memo"];
  return [head.join(";"), ...rows.map(({ l, e, a }) =>
    [e!.date, e!.id.slice(0, 8), e!.description, e!.source, a!.code, a!.name, num(l.debit), num(l.credit), l.vat_code ?? "", l.memo ?? ""].map(esc).join(";"))].join("\n");
}

export const round2 = (n: number) => Math.round(n * 100) / 100;
