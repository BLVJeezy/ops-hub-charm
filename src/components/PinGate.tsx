import { useEffect, useState } from "react";
import { PIN_CODE, PIN_STORAGE_KEY } from "@/lib/constants";
import { SolynLogo } from "./SolynLogo";

export function PinGate({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [entered, setEntered] = useState("");
  const [shake, setShake] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined" && sessionStorage.getItem(PIN_STORAGE_KEY) === "true") {
      setUnlocked(true);
    }
  }, []);

  useEffect(() => {
    if (entered.length === 6) {
      if (entered === PIN_CODE) {
        sessionStorage.setItem(PIN_STORAGE_KEY, "true");
        setUnlocked(true);
      } else {
        setShake(true);
        setTimeout(() => { setShake(false); setEntered(""); }, 600);
      }
    }
  }, [entered]);

  if (!mounted) return null;
  if (unlocked) return <>{children}</>;

  const press = (n: string) => setEntered((prev) => (prev.length < 6 ? prev + n : prev));
  const back = () => setEntered((prev) => prev.slice(0, -1));

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className={`w-full max-w-xs ${shake ? "animate-pulse" : ""}`}>
        <div className="flex flex-col items-center mb-8">
          <SolynLogo size={48} />
          <h1 className="mt-4 text-lg font-semibold">Solyn Global</h1>
          <p className="text-xs text-muted-foreground mt-1">Enter access code</p>
        </div>
        <div className="flex justify-center gap-2 mb-8">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="w-3 h-3 rounded-full transition"
              style={{
                backgroundColor: i < entered.length ? "#C9A14A" : "transparent",
                border: `1px solid ${i < entered.length ? "#C9A14A" : "#303A43"}`,
              }}
            />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {["1","2","3","4","5","6","7","8","9"].map((n) => (
            <button
              key={n}
              onClick={() => press(n)}
              className="h-14 rounded-lg bg-card hover:bg-muted text-lg font-medium transition active:scale-95"
            >{n}</button>
          ))}
          <div />
          <button onClick={() => press("0")} className="h-14 rounded-lg bg-card hover:bg-muted text-lg font-medium transition active:scale-95">0</button>
          <button onClick={back} className="h-14 rounded-lg hover:bg-muted text-sm text-muted-foreground transition">←</button>
        </div>
      </div>
    </div>
  );
}
