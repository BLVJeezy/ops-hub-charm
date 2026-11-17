import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, X, Send, Trash2, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { askAssistant } from "@/lib/assistant.functions";
import type { ChatMessage } from "@/lib/assistant";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const STORE = "hub-assistant-chat";
type Line = ChatMessage & { did?: string[]; failed?: boolean };

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
 * The Hub assistant: a button on every page that opens a chat with Claude. It reads the Hub (clients, tasks, invoices,
 * sites, bookkeeping) with your own rights, can add tasks, and knows what you wrote under Knowledge.
 */
export function AssistantPanel() {
  const page = useRouterState({ select: (s) => s.location.pathname });
  const ask = useServerFn(askAssistant);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"chat" | "knowledge">("chat");
  const [chat, setChat] = useState<Line[]>(loadChat);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { localStorage.setItem(STORE, JSON.stringify(chat.slice(-60))); } catch { /* private window: the chat just does not survive a reload */ }
  }, [chat]);
  useEffect(() => { if (open) endRef.current?.scrollIntoView({ block: "end" }); }, [open, chat, busy, tab]);

  async function send(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    const next: Line[] = [...chat, { role: "user", content: q }];
    setChat(next);
    setText("");
    setBusy(true);
    try {
      // Failed answers are shown but not sent back as conversation.
      const res = await ask({ data: { messages: next.filter((m) => !m.failed).map(({ role, content }) => ({ role, content })), page } });
      setChat((c) => [...c, res.ok ? { role: "assistant", content: res.text, did: res.did } : { role: "assistant", content: res.message, failed: true }]);
    } catch (e) {
      setChat((c) => [...c, { role: "assistant", content: e instanceof Error ? e.message : "The assistant could not be reached.", failed: true }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          aria-label="Open assistant"
          onClick={() => setOpen(true)}
          className="press fixed z-30 right-4 lg:right-6 lg:!bottom-6 w-12 h-12 rounded-full flex items-center justify-center shadow-2xl shadow-black/40"
          style={{ backgroundColor: "#C9A14A", color: "#1B2228", bottom: "calc(5.25rem + env(safe-area-inset-bottom))" }}
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
          <div className="flex items-center gap-2 px-4 h-14 border-b shrink-0" style={{ borderColor: "hsl(var(--border))" }}>
            <Sparkles className="w-4 h-4" style={{ color: "#C9A14A" }} />
            <div className="text-sm font-semibold mr-auto">Assistant</div>
            {(["chat", "knowledge"] as const).map((t) => (
              <button key={t} type="button" onClick={() => setTab(t)} aria-pressed={tab === t}
                className="h-8 px-3 rounded-full text-xs capitalize"
                style={{ backgroundColor: tab === t ? "hsl(var(--primary) / 0.15)" : "transparent", color: tab === t ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))" }}>
                {t}
              </button>
            ))}
            <button type="button" aria-label="Close assistant" onClick={() => setOpen(false)} className="w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>

          {tab === "chat" ? (
            <>
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {chat.length === 0 && (
                  <div className="pt-6 space-y-3">
                    <p className="text-sm text-muted-foreground">Ask anything about Solyn, your clients or what is in the Hub. I can also add tasks for you.</p>
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
                      style={m.failed ? undefined : m.role === "user" ? { backgroundColor: "#C9A14A", color: "#1B2228" } : { backgroundColor: "hsl(var(--muted) / 0.6)" }}
                    >
                      {m.content}
                      {m.did?.map((d) => (
                        <div key={d} className="mt-2 flex items-start gap-1.5 text-xs" style={{ color: "#C9A14A" }}>
                          <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {d}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {busy && <div className="text-xs text-muted-foreground animate-pulse">Looking it up…</div>}
                <div ref={endRef} />
              </div>
              <form onSubmit={(e) => { e.preventDefault(); send(text); }} className="shrink-0 border-t p-3 flex items-end gap-2" style={{ borderColor: "hsl(var(--border))" }}>
                {chat.length > 0 && (
                  <button type="button" aria-label="Start a new chat" title="Start a new chat" disabled={busy} onClick={() => setChat([])} className="w-10 h-10 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(text); } }}
                  rows={1}
                  placeholder="Ask the assistant…"
                  className="flex-1 min-w-0 max-h-32 min-h-10 resize-none rounded-2xl bg-card border border-input px-3.5 py-2 text-base lg:text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button type="submit" aria-label="Send" disabled={busy || !text.trim()} className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 disabled:opacity-40" style={{ backgroundColor: "#C9A14A", color: "#1B2228" }}>
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
      <button type="button" onClick={save} disabled={saving || body === saved} className="h-10 rounded-full text-sm font-medium disabled:opacity-40" style={{ backgroundColor: "#C9A14A", color: "#1B2228" }}>
        {saving ? "Saving…" : body === saved ? "Saved" : "Save"}
      </button>
    </div>
  );
}
