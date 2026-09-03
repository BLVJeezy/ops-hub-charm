export type Currency = "EUR" | "USD";

const KEY = "solyn.currency";
const RATES: Record<Currency, number> = { EUR: 1, USD: 1.08 };
const SYMBOLS: Record<Currency, string> = { EUR: "€", USD: "$" };

let current: Currency = "EUR";
if (typeof window !== "undefined") {
  const stored = window.localStorage.getItem(KEY);
  if (stored === "USD" || stored === "EUR") current = stored;
}

const listeners = new Set<() => void>();

export function getCurrency(): Currency {
  return current;
}

export function setCurrency(c: Currency) {
  if (c === current) return;
  current = c;
  if (typeof window !== "undefined") window.localStorage.setItem(KEY, c);
  listeners.forEach((l) => l());
}

export function subscribeCurrency(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function currencySymbol(c: Currency = current): string {
  return SYMBOLS[c];
}

export function convertFromEur(amount: number, c: Currency = current): number {
  return amount * RATES[c];
}
