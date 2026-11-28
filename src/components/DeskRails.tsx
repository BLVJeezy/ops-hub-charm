/**
 * Desktop side rails, after the "desk" layout of a trading journal:
 * left = Desk (clients at a glance), right = Plan (today's tasks, agenda, what just happened).
 * Read-only views on existing tables; every row links to the page where you act on it.
 * Shown from 1400px; each rail folds to a thin strip and remembers that.
 */
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronsLeft, ChevronsRight, Circle } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { clientMRR, type FeeClient } from "@/lib/fees";
import { formatEUR, todayISO } from "@/lib/format";

const db = supabase as any;
const KEY = "hub-rails";

type Rails = { left: boolean; right: boolean };
function readRails(): Rails {
  try {
    return { left: true, right: true, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return { left: true, right: true };
  }
}
const listeners = new Set<(r: Rails) => void>();
export function useRails(): [Rails, (side: keyof Rails) => void] {
  const [r, setR] = useState<Rails>({ left: true, right: true });
  useEffect(() => {
    setR(readRails());
    listeners.add(setR);
    return () => void listeners.delete(setR);
  }, []);
  const toggle = (side: keyof Rails) => {
    const next = { ...readRails(), [side]: !readRails()[side] };
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* not stored: still toggles for this visit */
    }
    listeners.forEach((f) => f(next));
  };
  return [r, toggle];
}

/** Reload rail data when you change page and every minute. */
function useRailData<T>(load: () => Promise<T>): T | null {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    let alive = true;
    const run = () =>
      load()
        .then((d) => alive && setData(d))
        .catch((e) => console.warn("rail", e));
    run();
    const t = setInterval(run, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  return data;
}

function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="py-3 border-b border-border/60 last:border-b-0">
      <div className="flex items-center justify-between px-3 mb-1.5">
        <h3 className="text-[11px] font-medium text-muted-foreground">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}
const Empty = ({ children }: { children: ReactNode }) => (
  <p className="px-3 text-xs text-muted-foreground">{children}</p>
);
const SITE_DOT: Record<string, string> = { up: "bg-emerald-400", ok: "bg-emerald-400", degraded: "bg-amber-400", slow: "bg-amber-400", down: "bg-red-400" };

function Fold({ side, onToggle }: { side: "left" | "right"; onToggle: () => void }) {
  const Icon = side === "left" ? ChevronsRight : ChevronsLeft;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={side === "left" ? "Desk openen" : "Plan openen"}
      title={side === "left" ? "Desk openen" : "Plan openen"}
      className="h-9 w-9 mt-2 mx-auto rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted"
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}

const railBase = "hidden min-[1400px]:flex fixed top-14 bottom-0 z-[5] flex-col bg-background border-border";

// ---------------------------------------------------------------- left: Desk
type DeskClient = FeeClient & { id: string; name: string; brand_color: string | null; status: string; is_internal: boolean | null; pipeline_stage: string | null };
type DeskData = {
  active: (DeskClient & { mrr: number; site: string | null })[];
  prospects: number;
  open: number;
  openCount: number;
  sitesOk: number;
  sitesTotal: number;
  incidents: number;
};

async function loadDesk(): Promise<DeskData> {
  const [c, s, i, inc] = await Promise.all([
    db.from("clients").select("*"),
    db.from("monitored_sites").select("client_id,last_status,enabled"),
    db.from("invoices").select("total,status").eq("status", "Sent"),
    db.from("incidents").select("id").eq("status", "open"),
  ]);
  const sites = ((s.data as any[]) ?? []).filter((x) => x.enabled !== false);
  const siteOf = (id: string) => {
    const mine = sites.filter((x) => x.client_id === id).map((x) => String(x.last_status || ""));
    if (!mine.length) return null;
    return mine.includes("down") ? "down" : mine.some((x) => x === "degraded" || x === "slow") ? "degraded" : "up";
  };
  const all = ((c.data as DeskClient[]) ?? []).filter((x) => !x.is_internal);
  const active = all
    .filter((x) => x.status === "Active")
    .map((x) => ({ ...x, mrr: clientMRR(x), site: siteOf(x.id) }))
    .sort((a, b) => b.mrr - a.mrr || a.name.localeCompare(b.name));
  const inv = (i.data as any[]) ?? [];
  return {
    active,
    prospects: all.filter((x) => x.status === "Prospect").length,
    open: inv.reduce((t, x) => t + Number(x.total || 0), 0),
    openCount: inv.length,
    sitesOk: sites.filter((x) => ["up", "ok"].includes(String(x.last_status))).length,
    sitesTotal: sites.length,
    incidents: ((inc.data as any[]) ?? []).length,
  };
}

export function DeskRail({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const d = useRailData(loadDesk);
  if (!open)
    return (
      <aside className={`${railBase} left-0 w-11 border-r`}>
        <Fold side="left" onToggle={onToggle} />
      </aside>
    );
  const mrr = d?.active.reduce((t, x) => t + x.mrr, 0) ?? 0;
  return (
    <aside className={`${railBase} left-0 w-60 border-r`} aria-label="Desk">
      <div className="flex items-center justify-between px-3 h-10 border-b border-border/60">
        <span className="text-[11px] font-semibold tracking-wide text-muted-foreground">DESK</span>
        <button type="button" onClick={onToggle} aria-label="Desk inklappen" title="Desk inklappen" className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted">
          <ChevronsLeft className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <Section
          title={`Klanten · ${d?.active.length ?? "…"} actief`}
          right={<span className="money text-[11px] text-muted-foreground tabular-nums">{formatEUR(mrr)}/m</span>}
        >
          {!d ? <Empty>Laden…</Empty> : !d.active.length ? <Empty>Nog geen actieve klanten.</Empty> : (
            <ul>
              {d.active.map((c) => (
                <li key={c.id}>
                  <Link to="/clients/$id" params={{ id: c.id }} className="flex items-center gap-2 px-3 py-1.5 text-[13px] hover:bg-muted/60">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.brand_color || "hsl(var(--muted-foreground))" }} />
                    <span className="flex-1 truncate">{c.name}</span>
                    <span className="money tabular-nums text-xs text-muted-foreground">{c.mrr ? formatEUR(c.mrr) : "—"}</span>
                    {c.site && <span title={`Site: ${c.site}`} className={`w-1.5 h-1.5 rounded-full shrink-0 ${SITE_DOT[c.site] ?? "bg-muted-foreground"}`} />}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
        {d && (
          <Section title="Pipeline">
            <Link to="/pipeline" className="flex items-center justify-between px-3 py-1 text-[13px] hover:bg-muted/60">
              <span>Prospects</span>
              <span className="tabular-nums text-muted-foreground">{d.prospects}</span>
            </Link>
          </Section>
        )}
      </div>
      {d && (
        <div className="border-t border-border/60 px-3 py-3 space-y-2 text-[13px]">
          <Link to="/invoices" className="flex items-center justify-between hover:text-primary">
            <span className="text-muted-foreground">Openstaand ({d.openCount})</span>
            <span className="money tabular-nums font-medium">{formatEUR(d.open)}</span>
          </Link>
          <Link to="/status" className="flex items-center justify-between hover:text-primary">
            <span className="text-muted-foreground">Sites</span>
            <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${d.incidents ? "text-red-400" : "text-emerald-400"}`}>
              <Circle className="w-2 h-2 fill-current" />
              {d.incidents ? `${d.incidents} incident${d.incidents > 1 ? "en" : ""}` : `${d.sitesOk}/${d.sitesTotal} OK`}
            </span>
          </Link>
        </div>
      )}
    </aside>
  );
}

// ---------------------------------------------------------------- right: Plan
type PlanData = {
  tasks: { id: string; title: string; due_date: string | null; client: string | null; color: string | null }[];
  agenda: { id: string; starts_at: string; ends_at: string | null; title: string | null; color: string | null }[];
  recent: { id: string; at: string; label: string; sub: string; to: string; tone: string }[];
};

const time = (iso: string) => new Date(iso).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" });
const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${Math.max(m, 1)} min`;
  if (m < 60 * 24) return `${Math.round(m / 60)} u`;
  return new Date(iso).toLocaleDateString("nl-BE", { day: "numeric", month: "short" });
};

async function loadPlan(): Promise<PlanData> {
  const today = todayISO();
  const start = new Date(`${today}T00:00:00`), end = new Date(start.getTime() + 864e5);
  const [c, t, a, r, p, inc] = await Promise.all([
    db.from("clients").select("id,name,brand_color"),
    db.from("client_tasks").select("id,title,due_date,client_id").is("done_at", null).lte("due_date", today).order("due_date").limit(8),
    db.from("calendar_busy").select("id,starts_at,ends_at,title,client_id").gte("starts_at", start.toISOString()).lt("starts_at", end.toISOString()).order("starts_at"),
    db.from("client_requests").select("id,title,client_id,created_at").order("created_at", { ascending: false }).limit(4),
    db.from("invoices").select("id,invoice_number,client_name,total,updated_at").eq("status", "Paid").order("updated_at", { ascending: false }).limit(3),
    db.from("incidents").select("id,title,opened_at,site_id").order("opened_at", { ascending: false }).limit(3),
  ]);
  const cl = new Map<string, any>(((c.data as any[]) ?? []).map((x) => [x.id, x]));
  const recent: PlanData["recent"] = [
    ...((r.data as any[]) ?? []).map((x) => ({ id: "r" + x.id, at: x.created_at, label: x.title || "Aanvraag", sub: `Aanvraag · ${cl.get(x.client_id)?.name ?? ""}`, to: "/aanvragen", tone: "bg-fuchsia-400" })),
    ...((p.data as any[]) ?? []).map((x) => ({ id: "p" + x.id, at: x.updated_at, label: `${x.client_name ?? "Factuur"}`, sub: `Betaald · factuur ${x.invoice_number ?? ""} · ${formatEUR(Number(x.total || 0))}`, to: "/invoices", tone: "bg-emerald-400" })),
    ...((inc.data as any[]) ?? []).map((x) => ({ id: "i" + x.id, at: x.opened_at, label: x.title, sub: "Incident", to: "/status", tone: "bg-red-400" })),
  ].filter((x) => x.at).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 6);
  return {
    tasks: ((t.data as any[]) ?? []).map((x) => ({ id: x.id, title: x.title, due_date: x.due_date, client: cl.get(x.client_id)?.name ?? null, color: cl.get(x.client_id)?.brand_color ?? null })),
    agenda: ((a.data as any[]) ?? []).map((x) => ({ id: x.id, starts_at: x.starts_at, ends_at: x.ends_at, title: x.title, color: cl.get(x.client_id)?.brand_color ?? null })),
    recent,
  };
}

export function PlanRail({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const d = useRailData(loadPlan);
  if (!open)
    return (
      <aside className={`${railBase} right-0 w-11 border-l`}>
        <Fold side="right" onToggle={onToggle} />
      </aside>
    );
  const now = new Date();
  const today = todayISO();
  return (
    <aside className={`${railBase} right-0 w-64 border-l`} aria-label="Plan van vandaag">
      <div className="flex items-center justify-between px-3 h-10 border-b border-border/60">
        <button type="button" onClick={onToggle} aria-label="Plan inklappen" title="Plan inklappen" className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted">
          <ChevronsRight className="w-4 h-4" />
        </button>
        <span className="text-[11px] font-semibold tracking-wide text-muted-foreground capitalize">
          {now.toLocaleDateString("nl-BE", { weekday: "short", day: "numeric", month: "short" })}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto">
        <Section title="Taken vandaag" right={<Link to="/agenda" className="text-[11px] text-primary hover:underline">Alles</Link>}>
          {!d ? <Empty>Laden…</Empty> : !d.tasks.length ? <Empty>Niets meer voor vandaag.</Empty> : (
            <ul>
              {d.tasks.map((t) => (
                <li key={t.id}>
                  <Link to="/agenda" className="flex items-start gap-2 px-3 py-1.5 text-[13px] hover:bg-muted/60">
                    <span className="mt-1.5 w-2 h-2 rounded-full shrink-0" style={{ background: t.color || "hsl(var(--muted-foreground))" }} />
                    <span className="flex-1 min-w-0">
                      <span className="block truncate">{t.title}</span>
                      <span className="block text-[11px] text-muted-foreground truncate">
                        {t.client ?? "Eigen taak"}{t.due_date && t.due_date < today ? " · te laat" : ""}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Agenda" right={<Link to="/agenda" className="text-[11px] text-primary hover:underline">Inplannen</Link>}>
          {!d ? <Empty>Laden…</Empty> : !d.agenda.length ? <Empty>Geen afspraken vandaag.</Empty> : (
            <ul>
              {d.agenda.map((a) => (
                <li key={a.id} className={`flex items-center gap-2 px-3 py-1.5 text-[13px] ${a.ends_at && new Date(a.ends_at) < now ? "opacity-50" : ""}`}>
                  <span className="tabular-nums text-xs text-muted-foreground w-10 shrink-0">{time(a.starts_at)}</span>
                  <span className="w-1 self-stretch rounded-full shrink-0" style={{ background: a.color || "hsl(var(--primary))" }} />
                  <span className="truncate">{a.title || "Bezet"}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Recent">
          {!d ? <Empty>Laden…</Empty> : !d.recent.length ? <Empty>Nog niets gebeurd.</Empty> : (
            <ul>
              {d.recent.map((x) => (
                <li key={x.id}>
                  <Link to={x.to} className="flex items-start gap-2 px-3 py-1.5 text-[13px] hover:bg-muted/60">
                    <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${x.tone}`} />
                    <span className="flex-1 min-w-0">
                      <span className="block truncate">{x.label}</span>
                      <span className="block text-[11px] text-muted-foreground truncate money">{x.sub}</span>
                    </span>
                    <span className="text-[11px] text-muted-foreground shrink-0">{ago(x.at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </aside>
  );
}
