import { useSyncExternalStore } from "react";
import { getCurrency, setCurrency, subscribeCurrency, type Currency } from "@/lib/currency";

export function useCurrency(): Currency {
  return useSyncExternalStore(
    (cb) => subscribeCurrency(cb),
    () => getCurrency(),
    () => "EUR" as Currency,
  );
}

export function CurrencyToggle() {
  const currency = useCurrency();
  return (
    <div className="inline-flex items-center rounded-full border border-border bg-card p-0.5 h-10 shrink-0">
      {(["EUR", "USD"] as Currency[]).map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => setCurrency(c)}
          className={`h-9 px-3 rounded-full text-sm font-medium transition-colors ${
            currency === c ? "bg-white text-black" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {c === "EUR" ? "€ EUR" : "$ USD"}
        </button>
      ))}
    </div>
  );
}
