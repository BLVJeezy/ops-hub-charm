import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  Check,
  CheckCircle2,
  Copy,
  Inbox,
  Link2,
  ListPlus,
  Mail,
  Pause,
  Paperclip,
  Play,
  RotateCcw,
  Timer,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  answerBy,
  byPriority,
  kindLabel,
  PAGE_RATE,
  PRIORITY_LABEL,
  requestLink,
  type Kind,
  type Status,
  type Urgency,
} from "@/lib/client-requests";
import {
  backPatch,
  clockLabel,
  ESTIMATES,
  estimateLabel,
  pausePatch,
  startPatch,
  workedSeconds,
} from "@/lib/request-timer";
import { updateRequest } from "@/lib/request-update.functions";

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
  started_at: string | null;
  done_at: string | null;
  start_mailed_at: string | null;
  done_mailed_at: string | null;
  estimate_minutes: number | null;
  assignee_user_id?: string | null;
  review_ready_at?: string | null;
  run_started_at: string | null;
  worked_seconds: number | null;
};
type Client = {
  id: string;
  name: string;
  brand_color: string | null;
  request_token: string | null;
  status: string | null;
  contact_email: string | null;
};
type Stage = "binnen" | "bezig" | "klaar";
const STAGES: { id: Stage; label: string; empty: string }[] = [
  { id: "binnen", label: "Binnengekomen", empty: "Niets nieuw" },
  { id: "bezig", label: "Bezig", empty: "Niets bezig" },
  { id: "klaar", label: "Klaar", empty: "Nog niets afgerond" },
];
const stageOf = (s: Status): Stage =>
  s === "bezig" || s === "gepauzeerd"
    ? "bezig"
    : s === "klaar" || s === "afgewezen"
      ? "klaar"
      : "binnen";
const date = (d: string) =>
  new Date(d).toLocaleDateString("nl-BE", { day: "numeric", month: "short" });
const stamp = (d: string) =>
  new Date(d).toLocaleString("nl-BE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

/** One shared second-tick for every running clock on the page. */
function useTick(on: boolean) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => set((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [on]);
}

/** Client requests as a pipeline: in → busy (clock runs, client mailed) → done (client mailed, with my note). */
/** Team member names by user id, for the "who does it" chip on each card. */
let TEAM_NAMES = new Map<string, string>();

function RequestsPage() {
  const [rows, setRows] = useState<Req[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [only, setOnly] = useState("");
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [links, setLinks] = useState(false);
  const [mobileStage, setMobileStage] = useState<Stage>("binnen");
  const [step, setStep] = useState<{ r: Req; stage: "start" | "done" } | null>(null);

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 45 * 864e5).toISOString();
    const [r, c] = await Promise.all([
      db
        .from("client_requests")
        .select("*")
        .or(`status.in.(nieuw,ingepland,bezig,gepauzeerd),updated_at.gte.${since}`)
        .order("created_at", { ascending: false })
        .limit(300),
      db
        .from("clients")
        .select("id, name, brand_color, request_token, status, contact_email")
        .order("name"),
    ]);
    if (r.error) toast.error(r.error.message);
    const { data: team } = await db.from("team_members").select("user_id, full_name");
    TEAM_NAMES = new Map((team ?? []).map((m: { user_id: string; full_name: string }) => [m.user_id, m.full_name.split(" ")[0]]));
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
  useTick(rows.some((r) => r.run_started_at));

  const byId = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const shown = useMemo(() => rows.filter((r) => !only || r.client_id === only), [rows, only]);
  const cols = useMemo(() => {
    const m: Record<Stage, Req[]> = { binnen: [], bezig: [], klaar: [] };
    for (const r of shown) m[stageOf(r.status)].push(r);
    m.binnen = byPriority(m.binnen);
    // running first, then paused
    m.bezig = byPriority(m.bezig).sort(
      (a, b) => Number(!a.run_started_at) - Number(!b.run_started_at),
    );
    m.klaar.sort((a, b) => (b.done_at ?? b.created_at).localeCompare(a.done_at ?? a.created_at));
    return m;
  }, [shown]);

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
    toast.success("Taak gemaakt");
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

  const card = (r: Req) => (
    <RequestCard
      key={r.id}
      r={r}
      c={byId.get(r.client_id)}
      open={openId === r.id}
      onToggle={() => setOpenId(openId === r.id ? null : r.id)}
      onPatch={(ch) => patch(r, ch)}
      onTask={() => makeTask(r)}
      onFile={openFile}
      onStep={(stage) => setStep({ r, stage })}
    />
  );

  return (
    <div className="p-4 md:p-6 max-w-7xl 3xl:max-w-[1700px] mx-auto space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Inbox className="w-6 h-6 shrink-0" /> Aanvragen
          </h1>
          <p className="text-sm text-muted-foreground mt-1 hidden md:block">
            Binnen → bezig → klaar. Bij starten loopt de timer, ook in de mail aan de klant. Wat
            niet werkt staat altijd bovenaan.
          </p>
        </div>
        <div className="flex items-center gap-2">
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
            className={`h-9 shrink-0 rounded-full border px-3 text-sm inline-flex items-center gap-1.5 ${links ? "border-foreground/40 bg-muted" : "border-border"}`}
          >
            <Link2 className="w-4 h-4" />
            Links
          </button>
        </div>
      </header>

      {links && <LinkList clients={clients} onCopy={copy} />}

      {/* phones: one stage at a time */}
      <div className="md:hidden grid grid-cols-3 rounded-full border border-border p-0.5 text-sm">
        {STAGES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setMobileStage(s.id)}
            aria-pressed={mobileStage === s.id}
            className={`h-9 rounded-full inline-flex items-center justify-center gap-1.5 ${mobileStage === s.id ? "bg-foreground text-background font-medium" : "text-muted-foreground"}`}
          >
            {s.id === "binnen" ? "Binnen" : s.label}
            <span
              className={`text-[11px] tabular-nums ${mobileStage === s.id ? "opacity-70" : ""}`}
            >
              {cols[s.id].length}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Laden…</p>
      ) : (
        <div className="grid md:grid-cols-3 gap-3 items-start">
          {STAGES.map((s) => (
            <section
              key={s.id}
              className={`${mobileStage === s.id ? "" : "hidden"} md:block min-w-0 rounded-2xl md:bg-muted/30 md:p-2`}
              aria-label={s.label}
            >
              <h2 className="hidden md:flex items-center justify-between px-1.5 pb-2 text-sm font-semibold">
                <span>{s.label}</span>
                <span className="text-xs font-normal text-muted-foreground tabular-nums">
                  {cols[s.id].length}
                </span>
              </h2>
              {cols[s.id].length === 0 ? (
                <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                  {s.empty}
                </p>
              ) : (
                <ol className="space-y-2">{cols[s.id].map(card)}</ol>
              )}
            </section>
          ))}
        </div>
      )}

      {step && (
        <StepDialog
          step={step}
          client={byId.get(step.r.client_id)}
          onClose={() => setStep(null)}
          onDone={(change) => {
            setRows((xs) => xs.map((x) => (x.id === step.r.id ? { ...x, ...change } : x)));
            setStep(null);
          }}
        />
      )}
    </div>
  );
}

function RequestCard({
  r,
  c,
  open,
  onToggle,
  onPatch,
  onTask,
  onFile,
  onStep,
}: {
  r: Req;
  c?: Client;
  open: boolean;
  onToggle: () => void;
  onPatch: (ch: Partial<Req>) => void;
  onTask: () => void;
  onFile: (p: string) => void;
  onStep: (s: "start" | "done") => void;
}) {
  const stage = stageOf(r.status);
  const due = stage === "binnen" ? answerBy(r) : null;
  const overdue = !!due && due < new Date().toISOString();
  const fix = r.kind === "probleem";
  const runs = !!r.run_started_at,
    paused = r.status === "gepauzeerd";
  const worked = workedSeconds(r),
    est = r.estimate_minutes ? r.estimate_minutes * 60 : 0,
    over = !!est && worked > est;
  return (
    <li
      className={`rounded-xl border bg-card ${fix && stage !== "klaar" ? "border-red-500/40" : r.status === "nieuw" ? "border-foreground/25" : "border-border"} ${r.status === "afgewezen" ? "opacity-50" : ""}`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full text-left p-3 pb-2 flex gap-2.5"
      >
        <span
          className="w-1 self-stretch rounded-full shrink-0"
          style={{ background: c?.brand_color ?? "hsl(0 0% 50%)" }}
        />
        <span className="min-w-0 flex-1">
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
            <span className={fix ? "rounded-full px-1.5 py-px bg-red-500/15 text-red-400" : ""}>
              {fix ? "werkt niet" : `· ${kindLabel(r.kind)}`}
              {r.pages ? ` (${r.pages})` : ""}
            </span>
            {r.estimate_eur ? <span data-private="">· €{Number(r.estimate_eur)}</span> : null}
            {due && (
              <span
                className={`rounded-full px-1.5 py-px ${overdue ? "bg-red-500/20 text-red-400" : "bg-muted"}`}
              >
                {overdue ? "antwoord te laat" : `antwoord vóór ${stamp(due)}`}
              </span>
            )}
            {r.wished_date && (
              <span className="inline-flex items-center gap-0.5">
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
            {r.assignee_user_id && (
              <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 ${r.review_ready_at && stage !== "klaar" ? "bg-primary/15 text-primary" : "bg-muted"}`}>
                {TEAM_NAMES.get(r.assignee_user_id) ?? "teamlid"}
                {r.review_ready_at && stage !== "klaar" ? " · klaar voor controle" : ""}
              </span>
            )}
            {r.task_id && (
              <span className="inline-flex items-center gap-0.5 text-emerald-500">
                <Check className="w-3 h-3" />
                taak
              </span>
            )}
            {stage === "binnen" && worked > 0 && <span>· al {clockLabel(worked)} gewerkt</span>}
            {stage === "bezig" && r.start_mailed_at && <span>· klant gemaild</span>}
            {stage === "klaar" && (
              <span>
                ·{" "}
                {r.status === "afgewezen"
                  ? "niet uitgevoerd"
                  : `klaar ${date(r.done_at ?? r.created_at)}${worked ? ` · ${clockLabel(worked)}` : ""}`}
                {r.done_mailed_at ? " · klant gemaild" : ""}
              </span>
            )}
          </span>
        </span>
      </button>

      {stage === "bezig" && (
        <div className="mx-3 mb-2 ml-6 flex items-center gap-2 rounded-lg bg-muted/50 px-2.5 py-1.5">
          <Timer
            className={`w-4 h-4 shrink-0 ${runs ? "text-emerald-400" : "text-muted-foreground"}`}
          />
          <span
            className={`font-mono text-base tabular-nums ${over ? "text-amber-400" : ""}`}
            aria-live="off"
          >
            {clockLabel(worked)}
          </span>
          <span className="text-xs text-muted-foreground truncate">
            {paused ? "gepauzeerd" : "loopt"}
            {r.estimate_minutes
              ? ` · geschat ${estimateLabel(r.estimate_minutes)}${over ? " · erover" : ""}`
              : ""}
          </span>
        </div>
      )}

      <div className="flex items-center gap-2 px-3 pb-3 pl-6">
        {stage !== "klaar" && (
          <div
            className="inline-flex rounded-full border border-border p-0.5"
            role="group"
            aria-label="Prioriteit"
          >
            {[1, 2, 3, 4].map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => onPatch({ priority: r.priority === p ? null : p })}
                aria-pressed={r.priority === p}
                title={PRIORITY_LABEL[p]}
                className={`w-7 h-7 rounded-full text-[11px] tabular-nums ${r.priority === p ? "bg-foreground text-background font-semibold" : "text-muted-foreground hover:text-foreground"}`}
              >
                P{p}
              </button>
            ))}
          </div>
        )}
        <span className="ml-auto" />
        {stage === "binnen" && (
          <button
            type="button"
            onClick={() => onStep("start")}
            className="h-8 rounded-full bg-foreground text-background px-3 text-xs font-semibold inline-flex items-center gap-1"
          >
            <Play className="w-3.5 h-3.5" />
            Start
          </button>
        )}
        {stage === "bezig" && runs && (
          <button
            type="button"
            onClick={() => onPatch(pausePatch(r) as Partial<Req>)}
            aria-label="Pauzeer"
            className="h-8 rounded-full border border-border px-2.5 text-xs inline-flex items-center gap-1 hover:bg-muted"
          >
            <Pause className="w-3.5 h-3.5" />
            Pauze
          </button>
        )}
        {stage === "bezig" && paused && (
          <button
            type="button"
            onClick={() => onPatch(startPatch(r) as Partial<Req>)}
            className="h-8 rounded-full border border-border px-2.5 text-xs inline-flex items-center gap-1 hover:bg-muted"
          >
            <Play className="w-3.5 h-3.5" />
            Hervat
          </button>
        )}
        {stage === "bezig" && (
          <button
            type="button"
            onClick={() => onStep("done")}
            className="h-8 rounded-full bg-emerald-500 text-black px-3 text-xs font-semibold inline-flex items-center gap-1"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Klaar
          </button>
        )}
      </div>
      {open && (
        <div className="mx-3 mb-3 rounded-lg bg-muted/40 p-3 text-sm space-y-2">
          <p className="whitespace-pre-wrap">
            {r.details || <span className="text-muted-foreground">Geen uitleg meegegeven.</span>}
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
                  onClick={() => onFile(f.path)}
                  className="text-xs rounded-lg border border-border px-2 py-1 hover:bg-muted inline-flex items-center gap-1"
                >
                  <Paperclip className="w-3 h-3" />
                  {f.name}
                </button>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Binnengekomen {stamp(r.created_at)}
            {r.started_at ? ` · eerst gestart ${stamp(r.started_at)}` : ""}
          </p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {!r.task_id && stage !== "klaar" && (
              <button
                type="button"
                onClick={onTask}
                className="h-8 rounded-full border border-border px-2.5 text-xs inline-flex items-center gap-1 hover:bg-muted"
              >
                <ListPlus className="w-3.5 h-3.5" />
                Taak maken
              </button>
            )}
            {stage === "binnen" && (
              <button
                type="button"
                onClick={() => onPatch({ status: "afgewezen", done_at: new Date().toISOString() })}
                className="h-8 rounded-full border border-border px-2.5 text-xs inline-flex items-center gap-1 hover:bg-muted"
              >
                <X className="w-3.5 h-3.5" />
                Niet uitvoeren
              </button>
            )}
            {stage === "bezig" && (
              <button
                type="button"
                onClick={() => onPatch(backPatch(r) as Partial<Req>)}
                className="h-8 rounded-full border border-border px-2.5 text-xs inline-flex items-center gap-1 hover:bg-muted"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Terug naar binnengekomen
              </button>
            )}
            {stage === "klaar" && (
              <button
                type="button"
                onClick={() => onPatch({ status: "gepauzeerd", done_at: null })}
                className="h-8 rounded-full border border-border px-2.5 text-xs inline-flex items-center gap-1 hover:bg-muted"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Heropenen
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

/** Start or finish a request: an estimate when starting, and whether the client gets a mail. */
function StepDialog({
  step,
  client,
  onClose,
  onDone,
}: {
  step: { r: Req; stage: "start" | "done" };
  client?: Client;
  onClose: () => void;
  onDone: (change: Partial<Req>) => void;
}) {
  const run = useServerFn(updateRequest);
  const to = step.r.contact_email || client?.contact_email || "";
  const [mail, setMail] = useState(!!to);
  const [note, setNote] = useState("");
  const [estimate, setEstimate] = useState<number | null>(step.r.estimate_minutes);
  const [busy, setBusy] = useState(false);
  const start = step.stage === "start";
  const go = async () => {
    setBusy(true);
    try {
      const res = await run({
        data: { id: step.r.id, stage: step.stage, mail, note, estimateMinutes: estimate },
      });
      const now = new Date().toISOString();
      onDone({
        ...(res.change as Partial<Req>),
        ...(res.mailed ? (start ? { start_mailed_at: now } : { done_mailed_at: now }) : {}),
      });
      if (res.mailed)
        toast.success(start ? "Gestart, klant gemaild" : "Afgerond, klant gemaild", {
          description: res.to,
        });
      else
        toast.success(start ? "Gestart, timer loopt" : "Afgerond", {
          description: mail ? `Geen mail: ${res.reason}` : undefined,
        });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Dat lukte niet");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{start ? "Aanvraag starten" : "Aanvraag afronden"}</DialogTitle>
          <DialogDescription>
            {step.r.title} · {client?.name}
          </DialogDescription>
        </DialogHeader>
        {start && (
          <div>
            <div className="text-sm font-medium">Geschatte tijd</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label="Geschatte tijd">
              {ESTIMATES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setEstimate(estimate === m ? null : m)}
                  aria-pressed={estimate === m}
                  className={`h-8 rounded-full border px-3 text-xs ${estimate === m ? "border-foreground bg-foreground text-background font-semibold" : "border-border hover:bg-muted"}`}
                >
                  {estimateLabel(m)}
                </button>
              ))}
            </div>
          </div>
        )}
        <label className="flex items-start justify-between gap-3 rounded-xl border border-border p-3">
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <Mail className="w-4 h-4" />
              Mail de klant
            </span>
            <span className="block text-xs text-muted-foreground mt-0.5">
              {!to
                ? "Geen e-mailadres bij deze klant of aanvraag"
                : start
                  ? `“We zijn begonnen”${estimate ? `, geschat ${estimateLabel(estimate)}` : ""}, met een timer die bij elke keer openen bijgewerkt is. Naar ${to}`
                  : `“Je aanvraag is klaar”, met de gewerkte tijd. Naar ${to}`}
            </span>
          </span>
          <Switch
            checked={mail}
            onCheckedChange={setMail}
            disabled={!to}
            aria-label="Mail de klant"
          />
        </label>
        {!start && mail && (
          <div>
            <label htmlFor="done-note" className="text-sm font-medium">
              Bericht erbij <span className="text-muted-foreground font-normal">(mag leeg)</span>
            </label>
            <Textarea
              id="done-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={3000}
              rows={4}
              className="mt-1.5"
              placeholder="Bv. de nieuwe foto's staan online, kijk even of alles klopt."
            />
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-10 rounded-full border border-border px-4 text-sm"
          >
            Annuleren
          </button>
          <button
            type="button"
            onClick={go}
            disabled={busy}
            className={`h-10 rounded-full px-5 text-sm font-semibold disabled:opacity-50 ${start ? "bg-foreground text-background" : "bg-emerald-500 text-black"}`}
          >
            {busy
              ? "Bezig…"
              : start
                ? mail
                  ? "Start en mail"
                  : "Start"
                : mail
                  ? "Klaar en mail"
                  : "Klaar"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LinkList({ clients, onCopy }: { clients: Client[]; onCopy: (c: Client) => void }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 md:p-4">
      <h2 className="font-semibold text-sm">Aanvraaglink per klant</h2>
      <p className="text-xs text-muted-foreground mt-0.5">
        Tik om te kopiëren. De klant ziet alleen zijn eigen aanvragen; een nieuwe pagina staat er
        met minimaal €{PAGE_RATE}.
      </p>
      <ul className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-x-1 gap-y-0.5">
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
