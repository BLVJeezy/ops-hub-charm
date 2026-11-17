import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, X, Send, Trash2, Check, Mic, Square, Volume2, VolumeX, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { askAssistant } from "@/lib/assistant.functions";
import type { ChatMessage, HubLink } from "@/lib/assistant";
import { setAssistantOpen, useAssistantOpen } from "@/lib/assistant-store";
import { canListen, canSpeak, getLang, getSpeak, listen, setLang, setSpeak, speak, stopSpeaking, unlockSpeech, type VoiceLang } from "@/lib/voice";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const STORE = "hub-assistant-chat";
const GOLD = { backgroundColor: "#C9A14A", color: "#1B2228" };
type Line = ChatMessage & { did?: string[]; links?: HubLink[]; failed?: boolean };

const IDEAS = ["What needs my attention today?", "Which clients have open tasks, and what do they pay per month?", "Are all client sites healthy?"];

function loadChat(): Line[] {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/**
 * The Hub assistant: a chat with Claude you can type or talk to. It reads the Hub (clients, tasks, invoices, sites,
 * bookkeeping) with your own rights, can add tasks, and knows what you wrote under Knowledge. On a phone the bottom bar
 * summons it; on desktop a button bottom right.
 */
export function AssistantPanel() {
  const page = useRouterState({ select: (s) => s.location.pathname });
  const router = useRouter();
  const ask = useServerFn(askAssistant);
  const open = useAssistantOpen();
  const [tab, setTab] = useState<"chat" | "knowledge">("chat");
  const [chat, setChat] = useState<Line[]>(loadChat);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [talking, setTalking] = useState(false);
  const [lang, setLangState] = useState<VoiceLang>(getLang);
  const [speakOn, setSpeakOn] = useState(getSpeak);
  const [voice, setVoice] = useState({ listen: false, speak: false });   // known only in the browser
  const stopListening = useRef<() => void>(() => {});
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chatRef = useRef(chat);
  chatRef.current = chat;

  useEffect(() => { setVoice({ listen: canListen(), speak: canSpeak() }); }, []);
  useEffect(() => {
    try { localStorage.setItem(STORE, JSON.stringify(chat.slice(-60))); } catch { /* private window: the chat just does not survive a reload */ }
  }, [chat]);
  useEffect(() => { if (open) endRef.current?.scrollIntoView({ block: "end" }); }, [open, chat, busy, tab]);
  useEffect(() => {
    const el = inputRef.current;   // the box grows with what you type or say, up to its max height
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [text, open, tab]);
  useEffect(() => {
    if (open) return;
    stopListening.current();   // closing the assistant ends listening and talking
    stopSpeaking();
    setTalking(false);
  }, [open]);

  const send = useCallback(async (question: string, spoken = false) => {
    const q = question.trim();
    if (!q) return;
    const next: Line[] = [...chatRef.current, { role: "user", content: q }];
    setChat(next);
    setText("");
    setBusy(true);
    let answer: Line;
    try {
      // Failed answers are shown but not sent back as conversation.
      const res = await ask({ data: { messages: next.filter((m) => !m.failed).map(({ role, content }) => ({ role, content })), page } });
      answer = res.ok ? { role: "assistant", content: res.text, did: res.did, links: res.links } : { role: "assistant", content: res.message, failed: true };
    } catch (e) {
      answer = { role: "assistant", content: e instanceof Error ? e.message : "The assistant could not be reached.", failed: true };
    }
    setChat((c) => [...c, answer]);
    setBusy(false);
    if (spoken && !answer.failed && getSpeak() && canSpeak()) {
      setTalking(true);
      speak(answer.content, getLang(), () => setTalking(false));
    }
  }, [ask, page]);

  function toggleMic() {
    if (listening) return stopListening.current();
    if (busy) return;
    stopSpeaking();
    setTalking(false);
    if (speakOn) unlockSpeech();   // must happen inside this tap, or a phone will not read the answer aloud
    setListening(true);
    setText("");
    stopListening.current = listen(lang, setText, (finalText, error) => {
      setListening(false);
      if (error) toast.error(error);
      if (finalText) send(finalText, true);
    });
  }

  function toggleSpeak() {
    const on = !speakOn;
    setSpeakOn(on);
    setSpeak(on);
    if (!on) { stopSpeaking(); setTalking(false); }
  }

  function switchLang() {
    const next: VoiceLang = lang === "nl-BE" ? "en-US" : "nl-BE";
    setLangState(next);
    setLang(next);
  }

  function follow(link: HubLink) {
    setAssistantOpen(false);
    router.history.push(link.path);
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          aria-label="Open assistant"
          onClick={() => setAssistantOpen(true)}
          className="press hidden lg:flex fixed z-30 right-6 bottom-6 w-12 h-12 rounded-full items-center justify-center shadow-2xl shadow-black/40"
          style={GOLD}
        >
          <Sparkles className="w-5 h-5" />
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="Hub assistant"
          className="fixed z-50 inset-0 lg:inset-auto lg:right-6 lg:bottom-6 lg:w-[420px] lg:h-[min(640px,calc(100vh-3rem))] flex flex-col bg-background lg:rounded-2xl lg:border lg:shadow-2xl lg:shadow-black/50"
          style={{ borderColor: "hsl(var(--border))", paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="flex items-center gap-1 px-4 h-14 border-b shrink-0" style={{ borderColor: "hsl(var(--border))" }}>
            <Sparkles className="w-4 h-4 mr-1" style={{ color: "#C9A14A" }} />
            <div className="text-sm font-semibold mr-auto">Assistant</div>
            {(["chat", "knowledge"] as const).map((t) => (
              <button key={t} type="button" onClick={() => setTab(t)} aria-pressed={tab === t}
                className="h-9 px-3 rounded-full text-xs capitalize"
                style={{ backgroundColor: tab === t ? "hsl(var(--primary) / 0.15)" : "transparent", color: tab === t ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))" }}>
                {t}
              </button>
            ))}
            <button type="button" aria-label="Close assistant" onClick={() => setAssistantOpen(false)} className="w-11 h-11 -mr-2 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground">
              <X className="w-5 h-5" />
            </button>
          </div>

          {tab === "chat" ? (
            <>
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {chat.length === 0 && (
                  <div className="pt-6 space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Ask anything about Solyn, your clients or what is in the Hub{voice.listen ? " — type it, or tap the microphone and say it" : ""}. I can also add tasks for you.
                    </p>
                    {IDEAS.map((q) => (
                      <button key={q} type="button" onClick={() => send(q)} className="press block w-full text-left text-sm rounded-xl border px-3 py-2.5 hover:border-primary/60" style={{ borderColor: "hsl(var(--border))" }}>
                        {q}
                      </button>
                    ))}
                  </div>
                )}
                {chat.map((m, i) => (
                  <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                    <div
                      className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap break-words ${m.failed ? "border border-destructive/50 text-destructive" : ""}`}
                      style={m.failed ? undefined : m.role === "user" ? GOLD : { backgroundColor: "hsl(var(--muted) / 0.6)" }}
                    >
                      {m.content}
                      {m.did?.map((d) => (
                        <div key={d} className="mt-2 flex items-start gap-1.5 text-xs" style={{ color: "#C9A14A" }}>
                          <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {d}
                        </div>
                      ))}
                      {!!m.links?.length && (
                        <div className="mt-2.5 flex flex-wrap gap-2">
                          {m.links.map((l) => (
                            <button key={l.path} type="button" onClick={() => follow(l)} className="press inline-flex items-center gap-1 min-h-9 px-3 rounded-full text-xs font-medium border" style={{ borderColor: "#C9A14A", color: "#C9A14A" }}>
                              {l.label} <ArrowUpRight className="w-3.5 h-3.5" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {busy && <div className="text-xs text-muted-foreground animate-pulse">Looking it up…</div>}
                {listening && <div className="text-xs animate-pulse" style={{ color: "#C9A14A" }}>Listening… tap the square when you are done.</div>}
                {talking && (
                  <button type="button" onClick={() => { stopSpeaking(); setTalking(false); }} className="text-xs underline text-muted-foreground">
                    Stop reading aloud
                  </button>
                )}
                <div ref={endRef} />
              </div>

              {(voice.listen || voice.speak) && (
                <div className="shrink-0 px-3 pt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  {voice.listen && (
                    <button type="button" onClick={switchLang} disabled={listening} className="h-8 px-3 rounded-full border" style={{ borderColor: "hsl(var(--border))" }} aria-label="Language for voice">
                      Voice: {lang === "nl-BE" ? "Nederlands" : "English"}
                    </button>
                  )}
                  {voice.speak && (
                    <button type="button" onClick={toggleSpeak} aria-pressed={speakOn} className="h-8 px-3 rounded-full border inline-flex items-center gap-1.5" style={{ borderColor: "hsl(var(--border))" }}>
                      {speakOn ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />} {speakOn ? "Reads answers aloud" : "Silent"}
                    </button>
                  )}
                </div>
              )}

              <form onSubmit={(e) => { e.preventDefault(); if (!busy && !listening) send(text); }} className="shrink-0 p-3 flex items-end gap-2">
                {chat.length > 0 && (
                  <button type="button" aria-label="Start a new chat" title="Start a new chat" disabled={busy || listening} onClick={() => { stopSpeaking(); setTalking(false); setChat([]); }} className="w-10 h-11 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <textarea
                  ref={inputRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (!busy && !listening) send(text); } }}
                  rows={1}
                  readOnly={listening}
                  placeholder={listening ? "Say it…" : "Ask the assistant…"}
                  className="flex-1 min-w-0 max-h-32 min-h-11 resize-none rounded-2xl bg-card border border-input px-3.5 py-2.5 text-base lg:text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
                {voice.listen && (
                  <button type="button" onClick={toggleMic} disabled={busy && !listening} aria-label={listening ? "Stop listening" : "Talk to the assistant"} aria-pressed={listening}
                    className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 border disabled:opacity-40 ${listening ? "animate-pulse" : ""}`}
                    style={listening ? { backgroundColor: "#C9A14A", color: "#1B2228", borderColor: "#C9A14A" } : { borderColor: "#C9A14A", color: "#C9A14A" }}>
                    {listening ? <Square className="w-4 h-4" /> : <Mic className="w-5 h-5" />}
                  </button>
                )}
                <button type="submit" aria-label="Send" disabled={busy || listening || !text.trim()} className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 disabled:opacity-40" style={GOLD}>
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </>
          ) : (
            <Knowledge />
          )}
        </div>
      )}
    </>
  );
}

/** What the assistant should know about the company that is not in the Hub's tables. One free text, read with every question. */
function Knowledge() {
  const [body, setBody] = useState<string | null>(null);
  const [saved, setSaved] = useState("");
  const [missing, setMissing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    db.from("assistant_knowledge").select("body").eq("key", "company").maybeSingle().then(({ data, error }: { data: { body: string } | null; error: unknown }) => {
      if (error) setMissing(true);
      setBody(data?.body ?? "");
      setSaved(data?.body ?? "");
    });
  }, []);

  async function save() {
    if (body === null) return;
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await db.from("assistant_knowledge").upsert({ key: "company", body, updated_by: u.user?.id, updated_at: new Date().toISOString() });
    setSaving(false);
    if (error) return toast.error(`Not saved: ${error.message}`);
    setSaved(body);
    toast.success("Knowledge saved");
  }

  if (body === null) return <div className="flex-1 p-4 text-xs text-muted-foreground">Loading…</div>;
  return (
    <div className="flex-1 flex flex-col min-h-0 p-4 gap-3">
      <p className="text-xs text-muted-foreground">
        Write here what the assistant should know about Solyn that is not in the Hub: services and prices, guarantees, how you work with each client, rules, tone of voice, tools. It reads this with every question.
      </p>
      {missing && <p className="text-xs text-destructive">The knowledge table is not in the database yet, so this cannot be saved. It is added when the assistant update is applied in Lovable.</p>}
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={"Services and prices\n- …\n\nHow we work\n- …"}
        className="flex-1 min-h-0 resize-none rounded-xl bg-card border border-input p-3 text-base lg:text-sm focus:outline-none focus:ring-1 focus:ring-primary"
      />
      <button type="button" onClick={save} disabled={saving || body === saved} className="h-11 rounded-full text-sm font-medium disabled:opacity-40" style={GOLD}>
        {saving ? "Saving…" : body === saved ? "Saved" : "Save"}
      </button>
    </div>
  );
}
