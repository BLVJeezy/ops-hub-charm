import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCheck, Clock, Eye, Mail, MailX, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { KIND_LABEL, MAIL_STATUS, type MailStatus } from "@/lib/client-email";
import { syncEmailsNow } from "@/lib/client-email.functions";

export const Route = createFileRoute("/_authenticated/mails")({ component: MailsPage });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
type Row = {
  id: string;
  client_id: string | null;
  to_email: string;
  subject: string;
  kind: string;
  status: MailStatus;
  sent_at: string;
  delivered_at: string | null;
  opened_at: string | null;
  bounced_at: string | null;
  error: string | null;
  checked_at: string | null;
};
type Client = { id: string; name: string; brand_color: string | null };
const stamp = (d: string) =>
  new Date(d).toLocaleString("nl-BE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
const ICON: Record<MailStatus, typeof Mail> = {
  failed: MailX,
  sent: Send,
  delayed: Clock,
  delivered: CheckCheck,
  opened: Eye,
  clicked: Eye,
  bounced: MailX,
  complained: AlertTriangle,
};
const TONE = {
  ok: "bg-emerald-500/15 text-emerald-300",
  best: "bg-sky-500/15 text-sky-300",
  wait: "bg-muted text-muted-foreground",
  bad: "bg-red-500/15 text-red-300",
};

/** Every mail the Hub sent to a client, and whether it arrived (from Resend). */
function MailsPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [only, setOnly] = useState("");
  const [problems, setProblems] = useState(false);
  const [busy, setBusy] = useState(false);
  const sync = useServerFn(syncEmailsNow);

  const load = useCallback(async () => {
    const [r, c] = await Promise.all([
      db.from("client_emails").select("*").order("sent_at", { ascending: false }).limit(400),
      db.from("clients").select("id, name, brand_color").order("name"),
    ]);
    if (r.error) toast.error(r.error.message);
    setRows(r.data ?? []);
    setClients(c.data ?? []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const byId = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const all = rows ?? [];
  const list = all.filter(
    (r) =>
      (!only || r.client_id === only) &&
      (!problems || MAIL_STATUS[r.status].tone === "bad" || r.status === "delayed"),
  );
  const last30 = all.filter((r) => Date.parse(r.sent_at) > Date.now() - 30 * 864e5);
  const arrived = last30.filter((r) =>
    ["delivered", "opened", "clicked"].includes(r.status),
  ).length;
  const bad = last30.filter((r) => MAIL_STATUS[r.status].tone === "bad").length;
  const waiting = last30.filter((r) => r.status === "sent" || r.status === "delayed").length;
  const checked = all
    .map((r) => r.checked_at)
    .filter(Boolean)
    .sort()
    .pop();

  const now = async () => {
    setBusy(true);
    try {
      const r = await sync();
      await load();
      toast.success(r.changed ? `${r.changed} bijgewerkt` : "Alles nagekeken, niets nieuws");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nakijken lukte niet");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl 3xl:max-w-[1500px] mx-auto space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Mail className="w-6 h-6 shrink-0" /> Mails
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Elke mail aan een klant en of hij aankwam. Elke 10 minuten nagekeken bij Resend
            {checked ? `, laatst ${stamp(checked)}` : ""}.
          </p>
        </div>
        <button
          type="button"
          onClick={now}
          disabled={busy}
          className="h-9 rounded-full border border-border px-3 text-sm inline-flex items-center gap-1.5 hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} />
          {busy ? "Bezig…" : "Nu nakijken"}
        </button>
      </header>

      <div className="grid grid-cols-3 gap-2 max-w-xl">
        <Stat n={arrived} label="aangekomen (30 d)" tone="text-emerald-400" />
        <Stat n={waiting} label="onderweg" />
        <Stat n={bad} label="niet aangekomen" tone={bad ? "text-red-400" : ""} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={only}
          onChange={(e) => setOnly(e.target.value)}
          className="h-9 min-w-0 max-w-[200px] rounded-full border border-border bg-background px-3 text-sm"
          aria-label="Klant"
        >
          <option value="">Alle klanten</option>
          {clients
            .filter((c) => all.some((r) => r.client_id === c.id))
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
        <button
          type="button"
          onClick={() => setProblems((p) => !p)}
          aria-pressed={problems}
          className={`h-9 rounded-full border px-3 text-sm ${problems ? "border-red-500/50 bg-red-500/10 text-red-300" : "border-border text-muted-foreground"}`}
        >
          Alleen problemen
        </button>
      </div>

      {rows === null ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Laden…</p>
      ) : list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {problems ? "Geen problemen. Alles kwam aan." : "Nog geen mails."}
        </div>
      ) : (
        <ul className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
          {list.map((r) => {
            const s = MAIL_STATUS[r.status],
              I = ICON[r.status],
              c = r.client_id ? byId.get(r.client_id) : undefined;
            return (
              <li key={r.id} className="p-3 flex items-start gap-3">
                <span
                  className="w-1 self-stretch rounded-full shrink-0"
                  style={{ background: c?.brand_color ?? "hsl(0 0% 50%)" }}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-medium">{c?.name ?? "Klant"}</span>
                    <span className="text-xs text-muted-foreground">
                      {KIND_LABEL[r.kind] ?? r.kind}
                    </span>
                  </span>
                  <span className="block text-sm truncate">{r.subject}</span>
                  <span className="block text-xs text-muted-foreground mt-0.5 [overflow-wrap:anywhere]">
                    naar {r.to_email} · verstuurd {stamp(r.sent_at)}
                    {r.delivered_at ? ` · aangekomen ${stamp(r.delivered_at)}` : ""}
                    {r.opened_at ? ` · geopend ${stamp(r.opened_at)}` : ""}
                    {r.bounced_at
                      ? ` · ${r.status === "complained" ? "spam" : "teruggestuurd"} ${stamp(r.bounced_at)}`
                      : ""}
                  </span>
                  {r.error && <span className="block text-xs text-red-300 mt-0.5">{r.error}</span>}
                  {r.status === "bounced" && (
                    <span className="block text-xs text-red-300 mt-0.5">
                      Het adres bestaat niet of de mailbox weigert. Kijk het e-mailadres van de
                      klant na.
                    </span>
                  )}
                </span>
                <span
                  className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs ${TONE[s.tone]}`}
                >
                  <I className="w-3.5 h-3.5" />
                  {s.label}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Stat({ n, label, tone = "" }: { n: number; label: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-3 py-2.5">
      <div className={`text-2xl font-bold tabular-nums ${tone}`}>{n}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}
