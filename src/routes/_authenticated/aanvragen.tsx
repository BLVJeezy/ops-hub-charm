import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, Check, Copy, Inbox, Link2, ListPlus, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  answerBy,
  byPriority,
  isOpen,
  kindLabel,
  PAGE_RATE,
  PRIORITY_LABEL,
  requestLink,
  STATUS,
  STATUS_LABEL,
  urgencyLabel,
  type Kind,
  type Status,
  type Urgency,
} from "@/lib/client-requests";

export const Route = createFileRoute("/_authenticated/aanvragen")({ component: RequestsPage });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
type Req = {
  id: string;
  client_id: string;
  title: string;
  details: string | null;
  kind: Kind;
  pages: number | null;
  urgency: Urgency;
  priority: number | null;
  status: Status;
  estimate_eur: number | null;
  wished_date: string | null;
  contact_name: string | null;
  contact_email: string | null;
  attachments: { name: string; path: string }[];
  task_id: string | null;
  created_at: string;
};
type Client = {
  id: string;
  name: string;
  brand_color: string | null;
  request_token: string | null;
  status: string | null;
};
const URGENCY_TONE: Record<Urgency, string> = {
  dringend: "bg-red-500/15 text-red-400",
  hoog: "bg-amber-500/15 text-amber-400",
  normaal: "bg-muted text-muted-foreground",
  laag: "bg-muted text-muted-foreground",
};
const STATUS_TONE: Record<Status, string> = {
  nieuw: "bg-sky-500/15 text-sky-300",
  ingepland: "bg-violet-500/15 text-violet-300",
  bezig: "bg-amber-500/15 text-amber-300",
  klaar: "bg-emerald-500/15 text-emerald-300",
  afgewezen: "bg-muted text-muted-foreground",
};
const date = (d: string) =>
  new Date(d).toLocaleDateString("nl-BE", { day: "numeric", month: "short" });

/** Everything clients asked for, in the order to work through it. */
function RequestsPage() {
  const [rows, setRows] = useState<Req[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [show, setShow] = useState<"open" | "all">("open");
  const [only, setOnly] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [links, setLinks] = useState(false);

  const load = useCallback(async () => {
    const [r, c] = await Promise.all([
      db.from("client_requests").select("*").order("created_at", { ascending: false }).limit(300),
      db.from("clients").select("id, name, brand_color, request_token, status").order("name"),
    ]);
    if (r.error) toast.error(r.error.message);
    setRows(r.data ?? []);
    setClients(c.data ?? []);
    setLoading(false);
  }, []);
  useEffect(() => {
    load();
    const ch = supabase
      .channel("client-requests")
      .on("postgres_changes", { event: "*", schema: "public", table: "client_requests" }, () =>
        load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);

  const byId = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const list = useMemo(
    () =>
      byPriority(
        rows.filter((r) => (show === "all" || isOpen(r.status)) && (!only || r.client_id === only)),
      ),
    [rows, show, only],
  );
  const openCount = rows.filter((r) => isOpen(r.status)).length;
  const fresh = rows.filter((r) => r.status === "nieuw").length;
  const value = rows
    .filter((r) => isOpen(r.status))
    .reduce((s, r) => s + Number(r.estimate_eur ?? 0), 0);
  const today = new Date().toISOString().slice(0, 10);

  const patch = async (r: Req, change: Partial<Req>) => {
    setRows((xs) => xs.map((x) => (x.id === r.id ? { ...x, ...change } : x)));
    const { error } = await db
      .from("client_requests")
      .update({ ...change, updated_at: new Date().toISOString() })
      .eq("id", r.id);
    if (error) {
      toast.error(error.message);
      load();
    }
  };
  const makeTask = async (r: Req) => {
    const { data, error } = await db
      .from("client_tasks")
      .insert({ client_id: r.client_id, title: r.title, assignee: "me", due_date: r.wished_date })
      .select("id")
      .single();
    if (error) return toast.error(error.message);
    await patch(r, { task_id: data.id, status: r.status === "nieuw" ? "ingepland" : r.status });
    toast.success("Taak gemaakt en aanvraag ingepland");
  };
  const openFile = async (path: string) => {
    const { data, error } = await supabase.storage.from("booking-files").createSignedUrl(path, 300);
    if (error || !data?.signedUrl) toast.error("Bestand openen lukte niet");
    else window.open(data.signedUrl, "_blank", "noopener");
  };
  const copy = async (c: Client) => {
    if (!c.request_token) return toast.error("Deze klant heeft nog geen link");
    await navigator.clipboard.writeText(requestLink(c.request_token, c.name));
    toast.success(`Link voor ${c.name} gekopieerd`);
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl 3xl:max-w-[1500px] mx-auto space-y-4 md:space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Inbox className="w-6 h-6 shrink-0" /> Aanvragen
          </h1>
          <p className="text-sm text-muted-foreground mt-1 hidden md:block">
            Wat klanten vragen, in de volgorde om het af te werken.
          </p>
        </div>
        <div className="flex gap-1.5">
          <Stat n={fresh} label="nieuw" tone={fresh ? "text-sky-400" : ""} />
          <Stat n={openCount} label="open" />
          <Stat n={`€${Math.round(value)}`} label="richtprijs" priv />
        </div>
      </header>

      <div className="grid lg:grid-cols-[1fr_280px] gap-4 lg:gap-5 items-start">
        <section className="space-y-2 min-w-0">
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-full border border-border p-0.5 text-sm shrink-0">
              {(["open", "all"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setShow(v)}
                  className={`px-3 h-8 rounded-full ${show === v ? "bg-foreground text-background" : "text-muted-foreground"}`}
                >
                  {v === "open" ? "Open" : "Alles"}
                </button>
              ))}
            </div>
            <select
              value={only}
              onChange={(e) => setOnly(e.target.value)}
              className="h-9 min-w-0 max-w-[170px] rounded-full border border-border bg-background px-3 text-sm"
              aria-label="Klant"
            >
              <option value="">Alle klanten</option>
              {clients
                .filter((c) => rows.some((r) => r.client_id === c.id))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
            <button
              type="button"
              onClick={() => setLinks((v) => !v)}
              aria-expanded={links}
              className={`lg:hidden ml-auto h-9 shrink-0 rounded-full border px-3 text-sm inline-flex items-center gap-1.5 ${links ? "border-foreground/40 bg-muted" : "border-border"}`}
            >
              <Link2 className="w-4 h-4" />
              Links
            </button>
          </div>

          {links && (
            <div className="lg:hidden">
              <LinkList clients={clients} onCopy={copy} />
            </div>
          )}

          {loading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Laden…</p>
          ) : list.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-6 text-center">
              <p className="font-medium">{show === "open" ? "Niets open" : "Nog geen aanvragen"}</p>
              <p className="text-sm text-muted-foreground mt-1">
                Stuur een klant zijn link, dan komen vragen hier binnen in plaats van via losse
                berichten.
              </p>
            </div>
          ) : (
            <ol className="space-y-2">
              {list.map((r, i) => {
                const c = byId.get(r.client_id),
                  expanded = openId === r.id,
                  late = !!r.wished_date && isOpen(r.status) && r.wished_date < today,
                  due = r.status === "nieuw" ? answerBy(r) : null,
                  overdue = !!due && due < new Date().toISOString();
                return (
                  <li
                    key={r.id}
                    className={`rounded-2xl border bg-card ${r.status === "nieuw" ? "border-foreground/25" : "border-border"} ${isOpen(r.status) ? "" : "opacity-60"}`}
                  >
                    <div className="flex items-start gap-2.5 p-3 pb-2">
                      <span className="w-5 text-xs tabular-nums text-muted-foreground pt-1 shrink-0 text-right">
                        {isOpen(r.status) ? i + 1 : "–"}
                      </span>
                      <span
                        className="w-1 self-stretch rounded-full shrink-0"
                        style={{ background: c?.brand_color ?? "hsl(0 0% 50%)" }}
                      />
                      <button
                        type="button"
                        onClick={() => setOpenId(expanded ? null : r.id)}
                        aria-expanded={expanded}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span className="block font-medium leading-snug">
                          {r.status === "nieuw" && (
                            <span
                              className="inline-block w-2 h-2 rounded-full bg-sky-400 mr-1.5 align-middle"
                              aria-label="nieuw"
                            />
                          )}
                          {r.title}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
                          <span className="text-foreground/80">{c?.name ?? "Klant"}</span>
                          {due && (
                            <span
                              className={`rounded-full px-1.5 py-px ${overdue ? "bg-red-500/20 text-red-400" : "bg-muted text-muted-foreground"}`}
                            >
                              {overdue
                                ? "antwoord te laat"
                                : `antwoord vóór ${new Date(due).toLocaleString("nl-BE", { weekday: "short", hour: "2-digit", minute: "2-digit" })}`}
                            </span>
                          )}
                          <span>
                            · {kindLabel(r.kind)}
                            {r.pages ? ` (${r.pages})` : ""}
                          </span>
                          {r.estimate_eur ? (
                            <span data-private="">· €{Number(r.estimate_eur)}</span>
                          ) : null}
                          <span className={`rounded-full px-1.5 py-px ${URGENCY_TONE[r.urgency]}`}>
                            {urgencyLabel(r.urgency)}
                          </span>
                          {r.wished_date && (
                            <span
                              className={`inline-flex items-center gap-0.5 ${late ? "text-red-400" : ""}`}
                            >
                              <CalendarClock className="w-3 h-3" />
                              {date(r.wished_date)}
                            </span>
                          )}
                          {r.attachments?.length > 0 && (
                            <span className="inline-flex items-center gap-0.5">
                              <Paperclip className="w-3 h-3" />
                              {r.attachments.length}
                            </span>
                          )}
                          {r.task_id && (
                            <span className="inline-flex items-center gap-0.5 text-emerald-500">
                              <Check className="w-3 h-3" />
                              taak
                            </span>
                          )}
                        </span>
                      </button>
                      <select
                        value={r.status}
                        onChange={(e) => patch(r, { status: e.target.value as Status })}
                        aria-label="Status"
                        className={`h-8 w-[104px] shrink-0 truncate rounded-full border-0 pl-2.5 pr-1 text-xs font-medium ${STATUS_TONE[r.status]}`}
                      >
                        {STATUS.map((st) => (
                          <option key={st} value={st}>
                            {STATUS_LABEL[st]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-2 px-3 pb-3 pl-[2.6rem]">
                      <div
                        className="inline-flex rounded-full border border-border p-0.5"
                        role="group"
                        aria-label="Prioriteit"
                      >
                        {[1, 2, 3, 4].map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => patch(r, { priority: r.priority === p ? null : p })}
                            aria-pressed={r.priority === p}
                            title={PRIORITY_LABEL[p]}
                            className={`w-8 h-7 rounded-full text-xs tabular-nums ${r.priority === p ? "bg-foreground text-background font-semibold" : "text-muted-foreground hover:text-foreground"}`}
                          >
                            P{p}
                          </button>
                        ))}
                      </div>
                      {r.priority == null && (
                        <span className="text-[11px] text-muted-foreground hidden sm:inline">
                          volgens klant
                        </span>
                      )}
                      {!r.task_id && isOpen(r.status) && (
                        <button
                          type="button"
                          onClick={() => makeTask(r)}
                          className="ml-auto h-8 rounded-full border border-border px-2.5 text-xs inline-flex items-center gap-1 hover:bg-muted"
                        >
                          <ListPlus className="w-3.5 h-3.5" />
                          Taak
                        </button>
                      )}
                    </div>
                    {expanded && (
                      <div className="mx-3 mb-3 ml-[2.6rem] rounded-xl bg-muted/40 p-3 text-sm space-y-2">
                        <p className="whitespace-pre-wrap">
                          {r.details || (
                            <span className="text-muted-foreground">Geen uitleg meegegeven.</span>
                          )}
                        </p>
                        {(r.contact_name || r.contact_email) && (
                          <p className="text-xs text-muted-foreground">
                            Van {[r.contact_name, r.contact_email].filter(Boolean).join(" · ")}
                          </p>
                        )}
                        {r.attachments?.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {r.attachments.map((f) => (
                              <button
                                key={f.path}
                                type="button"
                                onClick={() => openFile(f.path)}
                                className="text-xs rounded-lg border border-border px-2 py-1 hover:bg-muted inline-flex items-center gap-1"
                              >
                                <Paperclip className="w-3 h-3" />
                                {f.name}
                              </button>
                            ))}
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Binnengekomen {date(r.created_at)}
                        </p>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <aside className="hidden lg:block lg:sticky lg:top-4">
          <LinkList clients={clients} onCopy={copy} />
        </aside>
      </div>
    </div>
  );
}

function LinkList({ clients, onCopy }: { clients: Client[]; onCopy: (c: Client) => void }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 lg:p-4">
      <h2 className="font-semibold text-sm lg:text-base">Aanvraaglink per klant</h2>
      <p className="text-xs text-muted-foreground mt-0.5">
        Tik om te kopiëren. De klant ziet alleen zijn eigen aanvragen; een nieuwe pagina staat er
        met minimaal €{PAGE_RATE}.
      </p>
      <ul className="mt-2 grid grid-cols-2 lg:grid-cols-1 gap-x-1 gap-y-0.5">
        {clients
          .filter((c) => c.status !== "Write-off")
          .map((c) => (
            <li key={c.id} className="min-w-0">
              <button
                type="button"
                onClick={() => onCopy(c)}
                className="w-full flex items-center gap-2 rounded-lg px-2 h-9 text-sm hover:bg-muted active:bg-muted text-left"
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: c.brand_color ?? "hsl(0 0% 50%)" }}
                />
                <span className="truncate flex-1">{c.name}</span>
                <Copy className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              </button>
            </li>
          ))}
      </ul>
    </div>
  );
}

function Stat({
  n,
  label,
  tone = "",
  priv,
}: {
  n: number | string;
  label: string;
  tone?: string;
  priv?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-2.5 py-1.5 leading-tight min-w-[56px]">
      <div className={`font-bold tabular-nums ${tone}`} data-private={priv ? "" : undefined}>
        {n}
      </div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}
