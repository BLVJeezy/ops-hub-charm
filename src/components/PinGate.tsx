import { useEffect, useState } from "react";
import { PIN_STORAGE_KEY } from "@/lib/constants";
import { verifyPin } from "@/lib/pin.functions";
import { SolynLogo } from "./SolynLogo";
import { EyeOff } from "lucide-react";
import { initPrivacy, setPrivacy, usePrivacy } from "@/lib/privacy";

export function PinGate({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [entered, setEntered] = useState("");
  const [shake, setShake] = useState(false);
  const hidden = usePrivacy();

  useEffect(() => {
    setMounted(true);
    initPrivacy();
    if (typeof window !== "undefined" && sessionStorage.getItem(PIN_STORAGE_KEY) === "true") {
      setUnlocked(true);
    }
  }, []);

  useEffect(() => {
    if (entered.length === 6) {
      let cancelled = false;
      verifyPin({ data: { pin: entered } })
        .then((r) => r.ok)
        .catch(() => false)
        .then((ok) => {
          if (cancelled) return;
          if (ok) {
            sessionStorage.setItem(PIN_STORAGE_KEY, "true");
            setUnlocked(true);
          } else {
            setShake(true);
            setTimeout(() => { setShake(false); setEntered(""); }, 600);
          }
        });
      return () => { cancelled = true; };
    }
  }, [entered]);

  const press = (n: string) => setEntered((prev) => (prev.length < 6 ? prev + n : prev));
  const back = () => setEntered((prev) => prev.slice(0, -1));

  useEffect(() => {
    if (!mounted || unlocked) return;
    function onKey(e: KeyboardEvent) {
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        setEntered((prev) => (prev.length < 6 ? prev + e.key : prev));
      } else if (e.key === "Backspace") {
        e.preventDefault();
        setEntered((prev) => prev.slice(0, -1));
      } else if (e.key === "Escape") {
        setEntered("");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mounted, unlocked]);

  if (!mounted) return null;
  if (unlocked) return <>{children}</>;


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
        <button
          type="button"
          role="switch"
          aria-checked={hidden}
          onClick={() => setPrivacy(!hidden)}
          className="press mt-6 w-full flex items-center gap-3 rounded-2xl bg-card px-4 min-h-12 text-left"
        >
          <EyeOff className={`w-4 h-4 shrink-0 ${hidden ? "text-[#C9A14A]" : "text-muted-foreground"}`} />
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-medium">Cijfers verbergen</span>
            <span className="block text-[11px] text-muted-foreground">Bedragen wazig, om de Hub te tonen</span>
          </span>
          <span className={`relative w-11 h-6 rounded-full transition-colors ${hidden ? "bg-[#C9A14A]" : "bg-muted"}`}>
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${hidden ? "translate-x-5" : ""}`} />
          </span>
        </button>
      </div>
    </div>
  );
}
