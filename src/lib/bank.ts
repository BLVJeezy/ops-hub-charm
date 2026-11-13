/** Bank statement import (Revolut Business CSV export) and helpers. Pure. */

export type BankRow = {
  hash: string; date: string; type: string | null; description: string; amount: number; currency: string;
  orig_amount: number | null; orig_currency: string | null; fx_rate: number | null; fee: number; status: string;
};

/** RFC-4180-ish CSV splitter (quotes, commas or semicolons). */
export function parseCsv(text: string): string[][] {
  const t = text.replace(/^﻿/, "");
  const firstLine = t.slice(0, t.indexOf("\n") >>> 0);
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = []; let row: string[] = []; let cur = ""; let q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"' && t[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur); if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

const num = (s: string | undefined): number | null => {
  if (s == null || s.trim() === "") return null;
  let x = s.replace(/[^\d,.-]/g, "");
  if (x.includes(",") && x.includes(".")) x = x.lastIndexOf(",") > x.lastIndexOf(".") ? x.replace(/\./g, "").replace(",", ".") : x.replace(/,/g, "");
  else if (x.includes(",")) x = x.replace(",", ".");
  const n = Number(x); return Number.isFinite(n) ? n : null;
};

const TYPE: Record<string, string> = {
  CARD_PAYMENT: "CAR", CARD_REFUND: "MOR", TOPUP: "MOA", TRANSFER: "MOS", FEE: "FEE", EXCHANGE: "EXI", REFUND: "MOR", CARD_CREDIT: "MOR", ATM: "CAR",
};

/**
 * Revolut Business "Statement → CSV" export. Columns are matched by name, so their order does not matter:
 * Date completed (UTC) | Date started (UTC), ID, Type, State, Description, Reference, Payer, Orig currency, Orig amount,
 * Payment currency, Amount, Fee, Exchange rate, Account.
 * Only completed rows in `account` (EUR) are returned. Amount + Fee = what left the account.
 */
export function parseRevolutCsv(text: string, account = "EUR"): { rows: BankRow[]; skipped: number; error?: string } {
  const all = parseCsv(text);
  if (all.length < 2) return { rows: [], skipped: 0, error: "Leeg bestand" };
  const head = all[0].map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => head.findIndex((h) => names.some((n) => h === n || h.startsWith(n)));
  const c = {
    date: col("date completed", "completed date", "date"), started: col("date started"), id: col("id"), type: col("type"), state: col("state", "status"),
    desc: col("description"), ref: col("reference"), payer: col("payer"), ocur: col("orig currency"), oamt: col("orig amount"),
    cur: col("payment currency", "currency"), amt: col("amount"), fee: col("fee"), fx: col("exchange rate"), acc: col("account"),
  };
  if (c.amt < 0 || (c.date < 0 && c.started < 0) || c.desc < 0) return { rows: [], skipped: 0, error: "Geen Revolut-CSV: kolommen Date, Description en Amount ontbreken" };
  const rows: BankRow[] = []; let skipped = 0;
  for (const r of all.slice(1)) {
    const get = (i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
    const state = get(c.state).toUpperCase();
    const cur = (get(c.cur) || account).toUpperCase();
    const accName = get(c.acc);
    if ((state && !["COMPLETED", "COMPLETE"].includes(state)) || cur !== account || (accName && !accName.toUpperCase().includes(account))) { skipped++; continue; }
    const date = (get(c.date) || get(c.started)).slice(0, 10);
    const amount = num(get(c.amt)), fee = Math.abs(num(get(c.fee)) ?? 0);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || amount == null) { skipped++; continue; }
    const desc = [get(c.desc), get(c.ref) && get(c.ref) !== get(c.desc) ? get(c.ref) : ""].filter(Boolean).join(" • ") || get(c.payer) || "—";
    const ocur = get(c.ocur).toUpperCase() || null, oamt = num(get(c.oamt));
    const rawType = get(c.type).toUpperCase().replace(/\s+/g, "_");
    let type = TYPE[rawType] ?? (rawType.slice(0, 3) || null);
    if (rawType === "TRANSFER" && amount > 0) type = "MOR";
    if (rawType === "EXCHANGE" && amount < 0) type = "EXO";
    const total = Math.round((amount - (amount < 0 ? fee : 0)) * 100) / 100;
    const id = get(c.id);
    rows.push({
      hash: id ? `rvcsv-${id}` : `rvcsv-${date}-${total}-${desc.slice(0, 40)}`,
      date, type, description: desc, amount: total, currency: account,
      orig_amount: ocur && ocur !== account && oamt != null ? Math.abs(oamt) : null, orig_currency: ocur && ocur !== account ? ocur : null,
      fx_rate: num(get(c.fx)), fee, status: "Completed",
    });
  }
  return { rows, skipped };
}

/** Same money movement already imported from another source (e.g. the PDF)? Same day, same amount, similar text. */
export function isDuplicate(row: Pick<BankRow, "date" | "amount" | "description">, existing: Array<Pick<BankRow, "date" | "amount" | "description">>) {
  const w = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((x) => x.length > 2);
  const a = new Set(w(row.description));
  return existing.some((e) => e.date === row.date && Math.abs(Number(e.amount) - row.amount) < 0.005 && (a.size === 0 || w(e.description).some((x) => a.has(x))));
}

/** A reusable rule pattern from a bank line: "CAR Shell 7684 Tongere" → "CAR Shell%". */
export function rulePattern(type: string | null, description: string) {
  const first = description.split(/[•*]/)[0].trim().split(/\s+/).filter((x) => !/\d/.test(x)).slice(0, type === "MOS" || type === "MOA" || type === "MOR" ? 4 : 1).join(" ");
  return `${type ? type + " " : ""}${first.replace(/[%_]/g, "")}%`;
}
