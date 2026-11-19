import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, Check, Copy, Inbox, ListPlus, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
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
    await navigator.clipboard.writeText(requestLink(c.request_token, window.location.origin));
    toast.success(`Link voor ${c.name} gekopieerd`);
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl 3xl:max-w-[1500px] mx-auto space-y-5">
      <header>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
          <Inbox className="w-6 h-6 shrink-0" /> Aanvragen
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Wat klanten vragen, in de volgorde om het af te werken. Elke klant heeft een eigen link om
          iets aan te vragen.
        </p>
        <div className="grid grid-cols-3 gap-2 mt-3 max-w-md">
          <Count n={fresh} label="nieuw" warn={fresh > 0} />
          <Count n={openCount} label="open" />
          <Count n={value} label="richtprijs open" euro />
        </div>
      </header>

      <div className="grid lg:grid-cols-[1fr_300px] gap-5 items-start">
        <section className="space-y-2 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-full border border-border p-0.5 text-sm">
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
              className="h-9 rounded-full border border-border bg-background px-3 text-sm"
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
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Laden…</p>
          ) : list.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center">
              <p className="font-medium">{show === "open" ? "Niets open" : "Nog geen aanvragen"}</p>
              <p className="text-sm text-muted-foreground mt-1">
                Stuur een klant zijn link (rechts) zodat vragen hier binnenkomen in plaats van via
                losse berichten.
              </p>
            </div>
          ) : (
            <ol className="space-y-2">
              {list.map((r, i) => {
                const c = byId.get(r.client_id),
                  expanded = openId === r.id,
                  late =
                    r.wished_date &&
                    isOpen(r.status) &&
                    r.wished_date < new Date().toISOString().slice(0, 10);
                return (
                  <li
                    key={r.id}
                    className={`rounded-2xl border bg-card ${r.status === "nieuw" ? "border-foreground/25" : "border-border"} ${isOpen(r.status) ? "" : "opacity-60"}`}
                  >
                    <button
                      type="button"
                      onClick={() => setOpenId(expanded ? null : r.id)}
                      aria-expanded={expanded}
                      className="w-full text-left p-3 flex items-start gap-3"
                    >
                      <span className="w-6 text-sm tabular-nums text-muted-foreground pt-0.5 shrink-0">
                        {isOpen(r.status) ? i + 1 : "–"}
                      </span>
                      <span
                        className="w-1 self-stretch rounded-full shrink-0"
                        style={{ background: c?.brand_color ?? "hsl(0 0% 50%)" }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-medium">{r.title}</span>
                          {r.status === "nieuw" && (
                            <span className="text-[10px] rounded-full bg-sky-500/15 text-sky-400 px-1.5 py-0.5">
                              nieuw
                            </span>
                          )}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="text-foreground/80">{c?.name ?? "Klant"}</span>
                          <span>
                            · {kindLabel(r.kind)}
                            {r.pages ? ` (${r.pages})` : ""}
                          </span>
                          {r.estimate_eur ? <span>· €{Number(r.estimate_eur)}</span> : null}
                          <span className={`rounded-full px-1.5 py-0.5 ${URGENCY_TONE[r.urgency]}`}>
                            {urgencyLabel(r.urgency)}
                          </span>
                          {r.wished_date && (
                            <span
                              className={`inline-flex items-center gap-1 ${late ? "text-red-400" : ""}`}
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
                      </span>
                    </button>
                    <div className="px-3 pb-3 pl-12 flex flex-wrap items-center gap-2">
                      <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                        Prioriteit
                        <select
                          value={r.priority ?? ""}
                          onChange={(e) =>
                            patch(r, { priority: e.target.value ? Number(e.target.value) : null })
                          }
                          className="h-8 rounded-lg border border-border bg-background px-2 text-xs text-foreground"
                        >
                          <option value="">volgens klant</option>
                          {[1, 2, 3, 4].map((p) => (
                            <option key={p} value={p}>
                              {p} · {PRIORITY_LABEL[p]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                        Status
                        <select
                          value={r.status}
                          onChange={(e) => patch(r, { status: e.target.value as Status })}
                          className="h-8 rounded-lg border border-border bg-background px-2 text-xs text-foreground"
                        >
                          {STATUS.map((s) => (
                            <option key={s} value={s}>
                              {STATUS_LABEL[s]}
                            </option>
                          ))}
                        </select>
                      </label>
                      {!r.task_id && isOpen(r.status) && (
                        <button
                          type="button"
                          onClick={() => makeTask(r)}
                          className="h-8 rounded-lg border border-border px-2.5 text-xs inline-flex items-center gap-1.5 hover:bg-muted"
                        >
                          <ListPlus className="w-3.5 h-3.5" />
                          Maak taak
                        </button>
                      )}
                    </div>
                    {expanded && (
                      <div className="mx-3 mb-3 ml-12 rounded-xl bg-muted/40 p-3 text-sm space-y-2">
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

        <aside className="rounded-2xl border border-border bg-card p-4 lg:sticky lg:top-4">
          <h2 className="font-semibold">Aanvraaglink per klant</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Stuur deze link één keer; de klant ziet alleen zijn eigen aanvragen. Een nieuwe pagina
            staat er met minimaal €{PAGE_RATE} per pagina.
          </p>
          <ul className="mt-3 space-y-1">
            {clients
              .filter((c) => c.status !== "Write-off")
              .map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => copy(c)}
                    className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted text-left"
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
        </aside>
      </div>
    </div>
  );
}

function Count({
  n,
  label,
  warn,
  euro,
}: {
  n: number;
  label: string;
  warn?: boolean;
  euro?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card px-3 py-2.5">
      <div
        className={`text-2xl font-bold tabular-nums ${warn ? "text-sky-400" : ""}`}
        data-private={euro ? "" : undefined}
      >
        {euro ? `€${Math.round(n)}` : n}
      </div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}
