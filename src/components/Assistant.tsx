import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Send, Sparkles, Square, Volume2, VolumeX, X } from "lucide-react";
import { askAssistant } from "@/lib/assistant.functions";
import { speechText, type ChatMessage } from "@/lib/assistant";

export const toggleAssistant = () => window.dispatchEvent(new Event("assistant:toggle"));

const REASONS: Record<string, string> = {
  "no-key": "De assistent is nog niet aangesloten: de sleutel ANTHROPIC_API_KEY ontbreekt bij de geheimen van de Hub.",
  "bad-key": "De sleutel van de assistent wordt geweigerd. Kijk ANTHROPIC_API_KEY na.",
  "bad-model": "Het ingestelde AI-model bestaat niet. Kijk ASSISTANT_MODEL na.",
  "no-access": "Alleen een beheerder kan de assistent gebruiken.",
  busy: "De assistent is even overbelast. Probeer het zo meteen opnieuw.",
  "too-long": "Die vraag vroeg te veel opzoekwerk. Stel ze wat preciezer.",
  failed: "Dat lukte niet. Probeer het opnieuw.",
};
const IDEAS = ["Wat was de omzet de laatste 30 dagen?", "Wat moet ik vandaag doen?", "Welke facturen staan nog open?"];
type Lang = "nl-BE" | "en-GB";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const recognition = () => (typeof window === "undefined" ? null : ((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null));
const stored = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const store = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* no storage */ } };

/** The Hub assistant: a small chat box on every page that looks things up in the Hub, with voice in and out. */
export function Assistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [speak, setSpeak] = useState(true);
  const [lang, setLang] = useState<Lang>("nl-BE");
  const [canListen, setCanListen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rec = useRef<any>(null);

  useEffect(() => {
    setCanListen(!!recognition());
    if (stored("assistant-speak") === "off") setSpeak(false);
    if (stored("assistant-lang") === "en-GB") setLang("en-GB");
    const toggle = () => setOpen((v) => !v);
    window.addEventListener("assistant:toggle", toggle);
    return () => window.removeEventListener("assistant:toggle", toggle);
  }, []);
  const quiet = () => { try { window.speechSynthesis?.cancel(); } catch { /* no speech */ } };
  const close = useCallback(() => { setOpen(false); quiet(); rec.current?.abort?.(); setListening(false); }, []);
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open, close]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages, busy, error]);

  const say = (answer: string) => {
    if (!speak || !("speechSynthesis" in window)) return;
    quiet();
    const u = new SpeechSynthesisUtterance(speechText(answer));
    u.lang = lang;
    const voice = window.speechSynthesis.getVoices().find((v) => v.lang.replace("_", "-").startsWith(lang.slice(0, 2)));
    if (voice) u.voice = voice;
    window.speechSynthesis.speak(u);
  };
  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    // phones only let a page talk after a tap: a silent word now keeps the answer allowed to speak later
    if (speak && "speechSynthesis" in window) { quiet(); const u = new SpeechSynthesisUtterance(" "); u.volume = 0; window.speechSynthesis.speak(u); }
    const next = [...messages, { role: "user" as const, text: q }];
    setMessages(next); setText(""); setError(null); setBusy(true);
    try {
      const r = await askAssistant({ data: { messages: next } });
      if (r.ok) { setMessages([...next, { role: "assistant", text: r.text }]); say(r.text); }
      else setError(REASONS[r.reason] ?? REASONS.failed);
    } catch {
      setError(REASONS.failed);
    } finally {
      setBusy(false);
    }
  };
  const listen = () => {
    if (listening) { rec.current?.stop?.(); return; }
    const R = recognition();
    if (!R) return;
    quiet();
    const r = new R();
    r.lang = lang; r.interimResults = true; r.maxAlternatives = 1;
    let heard = "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    r.onresult = (e: any) => { heard = Array.from(e.results).map((x: any) => x[0].transcript).join(" "); setText(heard); };
    r.onerror = () => setListening(false);
    r.onend = () => { setListening(false); if (heard.trim()) ask(heard); };
    rec.current = r; setListening(true); setError(null);
    try { r.start(); } catch { setListening(false); }
  };

  if (!open) return null;
  return (
    <section role="dialog" aria-label="Assistent"
      className="pop-in fixed z-50 flex flex-col rounded-3xl border shadow-2xl shadow-black/50 backdrop-blur-xl left-1/2 -translate-x-1/2 w-[min(94vw,420px)] max-h-[min(70vh,560px)] lg:left-auto lg:translate-x-0 lg:right-6 lg:w-[400px] lg:max-h-[600px] bottom-[calc(5.25rem+env(safe-area-inset-bottom))] lg:bottom-6"
      style={{ backgroundColor: "hsl(var(--sidebar-background) / 0.96)", borderColor: "hsl(var(--sidebar-border))" }}>
      <header className="flex items-center gap-2 pl-4 pr-2 h-12 border-b shrink-0" style={{ borderColor: "hsl(var(--sidebar-border))" }}>
        <Sparkles className="w-4 h-4 text-[#C9A14A]" />
        <h2 className="text-sm font-semibold flex-1">Assistent</h2>
        <button type="button" onClick={() => { const l = lang === "nl-BE" ? "en-GB" : "nl-BE"; setLang(l); store("assistant-lang", l); }} aria-label={`Spraak in het ${lang === "nl-BE" ? "Nederlands" : "Engels"}. Tik om te wisselen.`}
          className="press h-8 px-2.5 rounded-full border border-border text-xs font-medium">{lang === "nl-BE" ? "NL" : "EN"}</button>
        <button type="button" onClick={() => { const v = !speak; setSpeak(v); store("assistant-speak", v ? "on" : "off"); if (!v) quiet(); }} aria-pressed={speak} aria-label={speak ? "Voorlezen staat aan" : "Voorlezen staat uit"}
          className="press w-9 h-9 rounded-full grid place-items-center text-muted-foreground">{speak ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}</button>
        <button type="button" onClick={close} aria-label="Sluiten" className="press w-9 h-9 rounded-full grid place-items-center text-muted-foreground"><X className="w-4 h-4" /></button>
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 min-h-[120px]" aria-live="polite">
        {messages.length === 0 && !busy && (
          <div className="py-2">
            <p className="text-sm text-muted-foreground px-1">Vraag iets over je klanten, facturen, taken, kosten of websites. Ik zoek het op in de Hub.</p>
            <div className="flex flex-col gap-1.5 mt-3">
              {IDEAS.map((q) => <button key={q} type="button" onClick={() => ask(q)} className="press text-left text-sm rounded-2xl border border-border px-3 py-2.5 hover:bg-muted/40">{q}</button>)}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${m.role === "user" ? "bg-[#C9A14A] text-[#1B2228]" : "bg-muted/60"}`}>{m.text}</div>
          </div>
        ))}
        {busy && <div className="text-sm text-muted-foreground px-1">Even opzoeken…</div>}
        {error && <div role="alert" className="text-sm rounded-2xl border border-red-400/40 bg-red-500/10 px-3 py-2">{error}</div>}
        <div ref={endRef} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); ask(text); }} className="flex items-center gap-1.5 p-2 border-t shrink-0" style={{ borderColor: "hsl(var(--sidebar-border))" }}>
        {canListen && (
          <button type="button" onClick={listen} aria-pressed={listening} aria-label={listening ? "Stop met luisteren" : "Spreek je vraag in"}
            className={`press w-11 h-11 rounded-full grid place-items-center shrink-0 ${listening ? "bg-red-500 text-white" : "border border-border"}`}>{listening ? <Square className="w-4 h-4" /> : <Mic className="w-5 h-5" />}</button>
        )}
        <input ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} placeholder={listening ? "Ik luister…" : "Stel je vraag"} aria-label="Je vraag" enterKeyHint="send"
          className="flex-1 min-w-0 h-11 rounded-full bg-card border border-input px-4 text-base lg:text-sm outline-none focus:ring-1 focus:ring-primary" />
        <button type="submit" disabled={busy || !text.trim()} aria-label="Verstuur" className="press w-11 h-11 rounded-full grid place-items-center shrink-0 disabled:opacity-40" style={{ backgroundColor: "#C9A14A", color: "#1B2228" }}><Send className="w-4 h-4" /></button>
      </form>
    </section>
  );
}
