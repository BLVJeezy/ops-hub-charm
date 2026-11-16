import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, CircleDashed, Clock, Hammer, Workflow } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ago, fresh, LIVE, PLANNED, RHYTHM_LABEL, type Automation, type Rhythm } from "@/lib/automations";

export const Route = createFileRoute("/_authenticated/automations")({ component: AutomationsPage });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
type Proof = Partial<Record<NonNullable<Automation["proof"]>, { at: string | null; note?: string }>>;
const latest = (rows: Record<string, string | null>[] | null, key: string) => (rows ?? []).map((r) => r[key]).filter(Boolean).sort().pop() ?? null;

function AutomationsPage() {
  const [proof, setProof] = useState<Proof>({});
  useEffect(() => {
    (async () => {
      const [sites, brief, rec, inv] = await Promise.all([
        db.from("monitored_sites").select("last_checked_at,last_backup_at,analytics_synced_at").eq("enabled", true),
        db.from("daily_briefings").select("rendered_at,created_at").order("day", { ascending: false }).limit(1),
        db.from("client_recurring_tasks").select("id", { count: "exact", head: true }).eq("active", true),
        db.from("invoices").select("id", { count: "exact", head: true }).eq("status", "Draft").not("scheduled_send_at", "is", null),
      ]);
      setProof({
        checked: { at: latest(sites.data, "last_checked_at") },
        backup: { at: latest(sites.data, "last_backup_at") },
        analytics: { at: latest(sites.data, "analytics_synced_at") },
        briefing: { at: brief.data?.[0]?.rendered_at ?? brief.data?.[0]?.created_at ?? null },
        tasks: { at: null, note: Number.isFinite(rec.count) ? `${rec.count} vaste taken` : undefined },
        scheduled: { at: null, note: Number.isFinite(inv.count) ? `${inv.count} ingepland` : undefined },
      });
    })();
  }, []);

  const groups = (["always", "daily", "weekly", "monthly"] as Rhythm[]).map((r) => ({ r, items: LIVE.filter((a) => a.rhythm === r) })).filter((g) => g.items.length);
  const stale = LIVE.filter((a) => a.proof && fresh(proof[a.proof]?.at, a.rhythm) === false);

  return (
    <div className="p-4 md:p-6 max-w-5xl 3xl:max-w-[1500px] mx-auto space-y-5 md:space-y-7">
      <header>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2"><Workflow className="w-6 h-6 shrink-0" /> Automations</h1>
        <p className="text-sm text-muted-foreground mt-1">Wat de Hub vanzelf doet, en wat we nog bouwen.</p>
        <div className="grid grid-cols-3 gap-2 mt-3 max-w-md">
          <Count n={LIVE.length} label="draaien" />
          <Count n={PLANNED.length} label="nog te bouwen" />
          <Count n={stale.length} label="te lang stil" warn={stale.length > 0} />
        </div>
      </header>

      <section className="space-y-4">
        <h2 className="text-base font-semibold">Draait nu</h2>
        {groups.map((g) => (
          <div key={g.r}>
            <div className="text-xs font-medium text-muted-foreground mb-1.5">{RHYTHM_LABEL[g.r]} · {g.items.length}</div>
            <ul className="grid md:grid-cols-2 3xl:grid-cols-3 gap-2">
              {g.items.map((a) => {
                const p = a.proof ? proof[a.proof] : undefined, ok = a.proof ? fresh(p?.at, a.rhythm) : null, last = ago(p?.at);
                return (
                  <li key={a.id} className="rounded-2xl border border-border bg-card p-4">
                    <div className="flex items-start gap-3">
                      {ok === false ? <Clock className="w-5 h-5 mt-0.5 shrink-0 text-amber-500" /> : <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0 text-emerald-500" />}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <h3 className="font-medium leading-snug">{a.name}</h3>
                          <span className="text-[11px] text-muted-foreground shrink-0">{a.runs}</span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">{a.what}</p>
                        <p className="text-xs mt-2">{a.when}</p>
                        {(last || p?.note) && <p className={`text-xs mt-0.5 ${ok === false ? "text-amber-500" : "text-muted-foreground"}`}>{last ? `Laatst: ${last}` : p?.note}{ok === false ? " — langer geleden dan verwacht" : ""}</p>}
                        {a.yours && <p className="text-xs mt-2 rounded-lg bg-muted/50 px-2.5 py-1.5"><span className="text-muted-foreground">Jij: </span>{a.yours}</p>}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        <p className="text-xs text-muted-foreground">"Laatst" staat er alleen bij wat de Hub zelf kan zien. Claude-taken melden hun resultaat met een pushmelding.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Nog te bouwen</h2>
        <ul className="grid md:grid-cols-2 3xl:grid-cols-3 gap-2">
          {PLANNED.map((a) => (
            <li key={a.id} className="rounded-2xl border border-dashed border-border p-4">
              <div className="flex items-start gap-3">
                {a.stage === "klaar om te bouwen" ? <Hammer className="w-5 h-5 mt-0.5 shrink-0 text-sky-400" /> : <CircleDashed className="w-5 h-5 mt-0.5 shrink-0 text-muted-foreground" />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="font-medium leading-snug">{a.name}</h3>
                    <span className={`text-[11px] shrink-0 rounded-full px-2 py-0.5 ${a.stage === "wacht op jou" ? "bg-amber-500/15 text-amber-500" : a.stage === "klaar om te bouwen" ? "bg-sky-500/15 text-sky-400" : "bg-muted text-muted-foreground"}`}>{a.stage}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">{a.what}</p>
                  <p className="text-xs mt-2"><span className="text-muted-foreground">Nodig: </span>{a.needs}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
function Count({ n, label, warn }: { n: number; label: string; warn?: boolean }) {
  return <div className="rounded-2xl border border-border bg-card px-3 py-2.5"><div className={`text-2xl font-bold tabular-nums ${warn ? "text-amber-500" : ""}`}>{n}</div><div className="text-[11px] text-muted-foreground">{label}</div></div>;
}
