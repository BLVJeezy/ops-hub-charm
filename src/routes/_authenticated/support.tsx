import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  ImagePlus,
  Inbox,
  MessageCircle,
  PencilRuler,
  RotateCcw,
  Send,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { SITES } from "@/lib/beheer-sites";
import { replySupport, updateSupportThread } from "@/lib/support.functions";

export const Route = createFileRoute("/_authenticated/support")({
  validateSearch: (s: Record<string, unknown>) => ({ t: typeof s.t === "string" ? s.t : undefined }),
  component: SupportPage,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
type Att = { url: string; name: string; type: string };
type Thread = {
  id: string;
  site: string;
  client_id: string | null;
  request_id: string | null;
  title: string;
  status: "open" | "opgelost";
  last_author: "client" | "solyn";
  created_at: string;
  updated_at: string;
  solyn_seen_at: string | null;
  client_seen_at: string | null;
};
type Msg = { id: string; author: "client" | "solyn"; body: string; attachments: Att[]; created_at: string };

const unread = (t: Thread) => t.last_author === "client" && (!t.solyn_seen_at || t.solyn_seen_at < t.updated_at);
const when = (iso: string) => {
  const d = new Date(iso),
    now = new Date();
  const same = d.toDateString() === now.toDateString();
  return same
    ? d.toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("nl-BE", { day: "numeric", month: "short" }) +
        " " +
        d.toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" });
};

/** Shrinks a picked image to max 1600 px as JPEG, so it fits the 4 MB chat limit. */
function shrink(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => reject(new Error("Deze afbeelding kan niet geopend worden"));
    img.src = URL.createObjectURL(file);
  });
}

function SupportPage() {
  const { t: openId } = Route.useSearch();
  const navigate = useNavigate({ from: "/support" });
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [colors, setColors] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<"open" | "alle">("open");

  const loadThreads = useCallback(async () => {
    const { data, error } = await db
      .from("support_threads")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) {
      toast.error("Gesprekken laden lukte niet: " + error.message);
      setThreads([]);
      return;
    }
    setThreads(data as Thread[]);
  }, []);

  useEffect(() => {
    loadThreads();
    const iv = setInterval(loadThreads, 10_000);
    db.from("clients")
      .select("id, brand_color")
      .then(({ data }: { data: { id: string; brand_color: string | null }[] | null }) =>
        setColors(Object.fromEntries((data ?? []).filter((c) => c.brand_color).map((c) => [c.id, c.brand_color!]))),
      );
    return () => clearInterval(iv);
  }, [loadThreads]);

  const shown = useMemo(
    () => (threads ?? []).filter((t) => filter === "alle" || t.status === "open" || t.id === openId),
    [threads, filter, openId],
  );
  const current = (threads ?? []).find((t) => t.id === openId) ?? null;
  const select = (id?: string) => navigate({ search: { t: id } });
  const nUnread = (threads ?? []).filter(unread).length;

  return (
    <div className="mx-auto max-w-6xl">
      <div className={`mb-4 flex items-center gap-3 ${current ? "hidden md:flex" : ""}`}>
        <MessageCircle className="h-5 w-5" />
        <h1 className="text-xl font-semibold">Support</h1>
        {nUnread > 0 && (
          <span className="rounded-full bg-sky-500 px-2 py-0.5 text-xs font-semibold text-white">{nUnread} nieuw</span>
        )}
        <div className="ml-auto inline-flex rounded-full border border-border p-0.5 text-sm">
          {(["open", "alle"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1 ${filter === f ? "bg-foreground text-background" : "text-muted-foreground"}`}
            >
              {f === "open" ? "Open" : "Alle"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[320px_1fr] md:h-[calc(100dvh-170px)]">
        <ol className={`space-y-1.5 md:overflow-y-auto md:pr-1 ${current ? "hidden md:block" : ""}`}>
          {threads === null ? (
            <li className="px-3 py-6 text-sm text-muted-foreground">Laden…</li>
          ) : shown.length === 0 ? (
            <li className="rounded-xl border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
              Geen open gesprekken. Een klant start er een via <b>Probleem melden</b> of de <b>Chat</b> in zijn beheer.
            </li>
          ) : (
            shown.map((t) => {
              const s = SITES[t.site];
              const isNew = unread(t);
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => select(t.id)}
                    className={`flex w-full gap-2.5 rounded-xl border p-3 text-left transition-colors ${t.id === openId ? "border-foreground/40 bg-accent" : "border-border bg-card hover:bg-accent/60"} ${t.status === "opgelost" ? "opacity-60" : ""}`}
                  >
                    <span
                      className="w-1 shrink-0 self-stretch rounded-full"
                      style={{ background: (t.client_id && colors[t.client_id]) || "hsl(0 0% 50%)" }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground/80">{s?.name ?? t.site}</span>
                        <span className="ml-auto tabular-nums">{when(t.updated_at)}</span>
                      </span>
                      <span className="mt-0.5 block truncate font-medium leading-snug">
                        {isNew && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-sky-400 align-middle" />}
                        {t.title}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {t.status === "opgelost"
                          ? "Opgelost"
                          : t.last_author === "client"
                            ? "Wacht op jouw antwoord"
                            : "Wacht op de klant"}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ol>

        {current ? (
          <Conversation key={current.id} t={current} onBack={() => select(undefined)} onChange={loadThreads} />
        ) : (
          <div className="hidden items-center justify-center rounded-2xl border border-dashed border-border text-sm text-muted-foreground md:flex">
            Kies een gesprek
          </div>
        )}
      </div>
    </div>
  );
}

function Conversation({ t, onBack, onChange }: { t: Thread; onBack: () => void; onChange: () => void }) {
  const site = SITES[t.site];
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [text, setText] = useState("");
  const [imgs, setImgs] = useState<string[]>([]);
  const [mail, setMail] = useState(true);
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const reply = useServerFn(replySupport);
  const update = useServerFn(updateSupportThread);

  const load = useCallback(async () => {
    const { data } = await db
      .from("support_messages")
      .select("id, author, body, attachments, created_at")
      .eq("thread_id", t.id)
      .order("created_at", { ascending: true });
    setMsgs((old) => {
      const next = (data ?? []) as Msg[];
      return old && old.length === next.length ? old : next;
    });
  }, [t.id]);

  useEffect(() => {
    load();
    const iv = setInterval(load, 6000);
    return () => clearInterval(iv);
  }, [load]);
  useEffect(() => {
    if (unread(t)) update({ data: { thread: t.id, seen: true } }).then(onChange, () => {});
  }, [t.id, t.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [msgs?.length]);

  async function send(resolve = false) {
    if ((!text.trim() && !imgs.length) || busy) return;
    setBusy(true);
    try {
      const r = await reply({ data: { thread: t.id, body: text, images: imgs, mail, resolve } });
      setMsgs((m) => [...(m ?? []), r.message as Msg]);
      setText("");
      setImgs([]);
      onChange();
      toast.success(r.mailed ? "Verstuurd, en de klant kreeg een mail" : "Verstuurd");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Versturen lukte niet");
    } finally {
      setBusy(false);
    }
  }
  async function setStatus(status: "open" | "opgelost") {
    try {
      await update({ data: { thread: t.id, status } });
      onChange();
      toast.success(status === "opgelost" ? "Op opgelost gezet" : "Weer open");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Dat lukte niet");
    }
  }

  return (
    <section className="flex min-h-[calc(100dvh-120px)] flex-col overflow-hidden rounded-2xl border border-border bg-card md:min-h-0">
      <header className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <button type="button" onClick={onBack} className="rounded-full p-2 hover:bg-accent md:hidden" aria-label="Terug">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground">
            {site?.name ?? t.site} · gestart {when(t.created_at)}
          </div>
          <h2 className="truncate font-semibold leading-snug">{t.title}</h2>
        </div>
        <div className="flex w-full flex-wrap gap-2 md:w-auto">
          {site && (
            <a
              href={site.beheer}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 text-sm font-medium text-background"
              title={`Open het beheer van ${site.name} (code: ${t.site === "villa-amano" ? "amano" : t.site === "horsey-valley" ? "horsey" : t.site})`}
            >
              <PencilRuler className="h-4 w-4" /> Open beheer
            </a>
          )}
          {site && (
            <a
              href={site.home}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm"
            >
              <ExternalLink className="h-4 w-4" /> Website
            </a>
          )}
          {t.request_id && (
            <Link
              to="/aanvragen"
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm"
            >
              <Inbox className="h-4 w-4" /> Aanvraag
            </Link>
          )}
          {t.status === "open" ? (
            <button
              type="button"
              onClick={() => setStatus("opgelost")}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm"
            >
              <CheckCircle2 className="h-4 w-4" /> Opgelost
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStatus("open")}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm"
            >
              <RotateCcw className="h-4 w-4" /> Heropen
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto p-3 md:p-4">
        {msgs === null ? (
          <p className="text-sm text-muted-foreground">Laden…</p>
        ) : (
          msgs.map((m) => (
            <div key={m.id} className={`flex ${m.author === "solyn" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed ${m.author === "solyn" ? "rounded-br-md bg-foreground text-background" : "rounded-bl-md bg-muted"}`}
              >
                {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                {m.attachments?.length > 0 && (
                  <div className={`flex flex-wrap gap-2 ${m.body ? "mt-2" : ""}`}>
                    {m.attachments.map((a) => (
                      <a key={a.url} href={a.url} target="_blank" rel="noopener" className="block">
                        <img src={a.url} alt={a.name} className="h-32 max-w-[240px] rounded-lg object-cover" loading="lazy" />
                      </a>
                    ))}
                  </div>
                )}
                <div className={`mt-1 text-[11px] ${m.author === "solyn" ? "text-background/60" : "text-muted-foreground"}`}>
                  {m.author === "solyn" ? "Jij" : (site?.name ?? "Klant")} · {when(m.created_at)}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={end} />
      </div>

      <form
        className="space-y-2 border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        {imgs.length > 0 && (
          <div className="flex gap-2">
            {imgs.map((src, i) => (
              <div key={i} className="relative">
                <img src={src} alt="" className="h-16 w-20 rounded-lg object-cover" />
                <button
                  type="button"
                  onClick={() => setImgs((x) => x.filter((_, j) => j !== i))}
                  className="absolute right-1 top-1 rounded-full bg-black/70 p-0.5 text-white"
                  aria-label="Weg"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
          }}
          placeholder={`Antwoord aan ${site?.name ?? "de klant"}…`}
          rows={3}
          className="resize-none text-base md:text-sm"
        />
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm">
            <ImagePlus className="h-4 w-4" /> Foto
            <input
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={async (e) => {
                const files = [...(e.target.files ?? [])].slice(0, 3 - imgs.length);
                e.target.value = "";
                try {
                  const out = await Promise.all(files.map(shrink));
                  setImgs((x) => [...x, ...out].slice(0, 3));
                } catch (er) {
                  toast.error(er instanceof Error ? er.message : "Foto lukte niet");
                }
              }}
            />
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Switch checked={mail} onCheckedChange={setMail} /> Mail de klant
          </label>
          <div className="ml-auto flex gap-2">
            {t.status === "open" && (
              <button
                type="button"
                disabled={busy || (!text.trim() && !imgs.length)}
                onClick={() => send(true)}
                className="rounded-full border border-border px-3 py-2 text-sm disabled:opacity-40"
              >
                Stuur + opgelost
              </button>
            )}
            <button
              type="submit"
              disabled={busy || (!text.trim() && !imgs.length)}
              className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-40"
            >
              <Send className="h-4 w-4" /> {busy ? "Versturen…" : "Stuur"}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
