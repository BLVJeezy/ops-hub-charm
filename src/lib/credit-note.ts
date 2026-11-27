export type CreditBadgeKind = "none" | "partial" | "full";

/** Format a positive EUR amount with cents in Belgian style, e.g. "€150,00". */
export function formatEURCents(amount: number): string {
  const n = Math.round((Number(amount) || 0) * 100) / 100;
  const abs = Math.abs(n);
  const formatted = new Intl.NumberFormat("nl-BE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(abs);
  return n < 0 ? `-€${formatted}` : `€${formatted}`;
}

export function creditBadgeKind(invoiceTotal: number, creditedAmount: number): CreditBadgeKind {
  const total = Number(invoiceTotal) || 0;
  const credited = Number(creditedAmount) || 0;
  if (credited <= 0.004) return "none";
  if (total > 0 && credited >= total - 0.004) return "full";
  return "partial";
}

/** Remaining income for an invoice after subtracting credited amounts (never negative). */
export function netInvoiceAmount(invoiceTotal: number, creditedAmount: number): number {
  const net = (Number(invoiceTotal) || 0) - (Number(creditedAmount) || 0);
  return Math.max(0, Math.round(net * 100) / 100);
}

/** Validate a credit note amount against the invoice total. Returns Dutch error or null. */
export function validateCreditAmount(amount: number, invoiceTotal: number): string | null {
  if (!Number.isFinite(amount) || amount <= 0) {
    return "Vul een geldig bedrag groter dan €0 in.";
  }
  const max = Math.round((Number(invoiceTotal) || 0) * 100) / 100;
  if (amount > max + 0.004) {
    return `Bedrag mag niet hoger zijn dan het factuurbedrag (${formatEURCents(max)}).`;
  }
  return null;
}

/** Compute the next sequential credit note number for a year (CN-YYYY-NNN). */
export function nextCreditNumber(existingNumbers: string[], year: number): string {
  const re = new RegExp(`^CN-${year}-(\\d+)$`);
  let max = 0;
  for (const num of existingNumbers) {
    const m = re.exec(num.trim());
    if (m) {
      const n = Number(m[1]);
      if (n > max) max = n;
    }
  }
  return `CN-${year}-${String(max + 1).padStart(3, "0")}`;
}