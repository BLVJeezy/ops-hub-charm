import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertCircle, Check, ChevronDown, Circle, CircleDot, ExternalLink, Minus } from "lucide-react";
import { merge, type Row } from "@/lib/site-checklist";
import { PHASES, nextStep, overall, phases, type PhaseStatus, type PhaseView } from "@/lib/site-process";

export type DeliveryClient = {
  id: string;
  name: string;
  status?: string | null;
  brand_color?: string | null;
};

export type ChecklistRowWithClient = Row & { client_id: string };

type Filter = "all" | "geblokkeerd" | "bezig" | "klaar";

type ClientSummary = {
  client: DeliveryClient;
  phaseList: PhaseView[];
  ov: { klaar: number; total: number; live: boolean };
  next: PhaseView | null;
  firstBlocked: PhaseView | null;
  hasBlocker: boolean;
};

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Alles" },
  { id: "geblokkeerd", label: "Geblokkeerd" },
  { id: "bezig", label: "Bezig" },
  { id: "klaar", label: "Klaar" },
];

export function DeliveryOverview({
  clients,
  rows,
  loading,
}: {
  clients: DeliveryClient[];
  rows: ChecklistRowWithClient[];
  loading: boolean;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const summaries = useMemo<ClientSummary[]>(() => {
    const byClient = new Map<string, Row[]>();
    for (const r of rows) {
      const list = byClient.get(r.client_id);
      if (list) list.push(r);
      else byClient.set(r.client_id, [r]);
    }

    const active = clients.filter(
      (c) => c.status === "Active" && c.name.trim().toLowerCase() !== "solyn global",
    );

    return active
      .map((client) => {
        const phaseList = phases(merge(byClient.get(client.id) ?? []));
        const ov = overall(phaseList);
        const next = nextStep(phaseList);
        const firstBlocked = phaseList.find((p) => p.status === "geblokkeerd") ?? null;
        return { client, phaseList, ov, next, firstBlocked, hasBlocker: Boolean(firstBlocked) };
      })
      .sort((a, b) => {
        if (a.hasBlocker !== b.hasBlocker) return a.hasBlocker ? -1 : 1;
        if (a.ov.live !== b.ov.live) return a.ov.live ? 1 : -1;
        const pa = a.ov.total ? a.ov.klaar / a.ov.total : 0;
        const pb = b.ov.total ? b.ov.klaar / b.ov.total : 0;
        if (pa !== pb) return pa - pb;
        return a.client.name.localeCompare(b.client.name, "nl");
      });
  }, [clients, rows]);

  const counts = useMemo(
    () => ({
      all: summaries.length,
      geblokkeerd: summaries.filter((s) => s.hasBlocker).length,
      bezig: summaries.filter((s) => !s.ov.live && !s.hasBlocker).length,
      klaar: summaries.filter((s) => s.ov.live).length,
    }),
    [summaries],
  );

  const filtered = useMemo(() => {
    if (filter === "geblokkeerd") return summaries.filter((s) => s.hasBlocker);
    if (filter === "bezig") return summaries.filter((s) => !s.ov.live && !s.hasBlocker);
    if (filter === "klaar") return summaries.filter((s) => s.ov.live);
    return summaries;
  }, [summaries, filter]);

  if (loading) {
    return <div className="text-sm text-muted-foreground py-6 text-center">Laden…</div>;
  }

  if (summaries.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        Geen actieve klanten gevonden.
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {FILTERS.map((f) => {
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`h-8 px-3 rounded-full text-xs font-medium border transition ${
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border hover:text-foreground"
              }`}
            >
              {f.label} <span className="opacity-75 tabular-nums">({counts[f.id]})</span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          Geen klanten in deze filter.
        </div>
      ) : (
        <>
          {/* Phone / tablet cards */}
          <div className="space-y-2 lg:hidden">
            {filtered.map((s) => {
              const isOpen = expandedId === s.client.id;
              const pct = s.ov.total ? Math.round((s.ov.klaar / s.ov.total) * 100) : 0;
              const barColor = s.ov.live ? "bg-emerald-500" : s.hasBlocker ? "bg-amber-400" : "bg-primary";
              const openPhases = s.phaseList.filter((p) => p.status !== "klaar" && p.status !== "nvt");
              return (
                <div key={s.client.id} className="rounded-xl border border-border bg-card overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpandedId(isOpen ? null : s.client.id)}
                    aria-expanded={isOpen}
                    className="w-full text-left p-3.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: s.client.brand_color || "hsl(var(--primary))" }}
                        />
                        <span className="font-semibold text-sm truncate">{s.client.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 text-xs text-muted-foreground tabular-nums">
                        <span>{s.ov.klaar}/{s.ov.total} fasen</span>
                        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                      </div>
                    </div>

                    <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
                    </div>

                    <div className="mt-2.5 flex items-center gap-1.5" aria-label="Fasenoverzicht">
                      {s.phaseList.map((ph) => (
                        <span
                          key={ph.id}
                          title={`${ph.label}: ${phaseTooltip(ph)}`}
                          className={`h-2.5 flex-1 rounded-full ${phaseDotClass(ph.status)}`}
                        />
                      ))}
                    </div>

                    <div className="mt-2 text-xs truncate">
                      <StatusLine summary={s} />
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-border px-3.5 py-3 space-y-2.5 bg-background/30">
                      {openPhases.length === 0 ? (
                        <div className="text-xs text-emerald-400">Alle fasen zijn afgerond.</div>
                      ) : (
                        openPhases.map((ph) => (
                          <div key={ph.id} className="text-xs">
                            <div className="flex items-center justify-between font-medium">
                              <span className={ph.status === "geblokkeerd" ? "text-amber-400" : "text-foreground"}>
                                {ph.label}
                              </span>
                              <span className="text-muted-foreground tabular-nums">{ph.done}/{ph.total}</span>
                            </div>
                            {ph.blockers.map((b, idx) => (
                              <div key={idx} className="text-amber-400 mt-0.5 pl-2 border-l border-amber-500/40">
                                {b.label} — {b.note}
                              </div>
                            ))}
                            {ph.missing.length > 0 && (
                              <div className="text-muted-foreground mt-0.5 pl-2 border-l border-border">
                                {ph.missing.join(", ")}
                              </div>
                            )}
                          </div>
                        ))
                      )}
                      <Link
                        to="/clients/$id"
                        params={{ id: s.client.id }}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline pt-1"
                      >
                        Open checklist <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Desktop matrix */}
          <div className="hidden lg:block rounded-xl border border-border bg-card overflow-x-auto max-h-[70vh] overflow-y-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 z-10 bg-card border-b border-border">
                <tr>
                  <th className="text-left text-xs font-semibold text-muted-foreground py-2.5 px-3 min-w-[160px]">
                    Klant
                  </th>
                  {PHASES.map((ph) => (
                    <th
                      key={ph.id}
                      className="text-center text-xs font-semibold text-muted-foreground py-2.5 px-2 whitespace-nowrap"
                    >
                      {ph.label}
                    </th>
                  ))}
                  <th className="text-left text-xs font-semibold text-muted-foreground py-2.5 px-3 min-w-[180px]">
                    Volgende stap
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((s) => (
                  <tr key={s.client.id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-2.5 px-3">
                      <Link
                        to="/clients/$id"
                        params={{ id: s.client.id }}
                        className="inline-flex items-center gap-2 font-medium hover:text-primary transition-colors"
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: s.client.brand_color || "hsl(var(--primary))" }}
                        />
                        <span className="truncate max-w-[180px]">{s.client.name}</span>
                      </Link>
                    </td>
                    {s.phaseList.map((ph) => (
                      <td key={ph.id} className="py-2.5 px-2 text-center" title={phaseTooltip(ph)}>
                        <span className="inline-flex items-center justify-center">
                          <MatrixIcon status={ph.status} />
                        </span>
                      </td>
                    ))}
                    <td className="py-2.5 px-3 text-xs">
                      <StatusLine summary={s} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function StatusLine({ summary }: { summary: ClientSummary }) {
  if (summary.firstBlocked) {
    const note = summary.firstBlocked.blockers[0]?.note ?? "";
    return (
      <span className="text-amber-400">
        Geblokkeerd: {summary.firstBlocked.label} – {note}
      </span>
    );
  }
  if (summary.ov.live) {
    return <span className="text-emerald-400">Volledig opgeleverd</span>;
  }
  if (summary.next) {
    return <span className="text-muted-foreground">Volgende: {summary.next.label}</span>;
  }
  return null;
}

function phaseDotClass(status: PhaseStatus) {
  switch (status) {
    case "klaar": return "bg-emerald-500";
    case "bezig": return "bg-primary";
    case "geblokkeerd": return "bg-amber-400";
    case "nvt": return "bg-muted/40 border border-dashed border-muted-foreground/30";
    default: return "bg-muted";
  }
}

function MatrixIcon({ status }: { status: PhaseStatus }) {
  if (status === "klaar") return <Check className="w-4 h-4 text-emerald-400" />;
  if (status === "bezig") return <CircleDot className="w-4 h-4 text-primary" />;
  if (status === "geblokkeerd") return <AlertCircle className="w-4 h-4 text-amber-400" />;
  if (status === "nvt") return <Minus className="w-4 h-4 text-muted-foreground/50" />;
  return <Circle className="w-4 h-4 text-muted-foreground/50" />;
}

function phaseTooltip(ph: PhaseView): string {
  if (ph.status === "klaar") return "Klaar";
  if (ph.status === "nvt") return "n.v.t.";
  const parts: string[] = [];
  if (ph.blockers.length > 0) {
    parts.push(`Geblokkeerd: ${ph.blockers.map((b) => `${b.label} (${b.note})`).join("; ")}`);
  }
  if (ph.missing.length > 0) {
    parts.push(`Open: ${ph.missing.join(", ")}`);
  }
  return parts.join(" · ") || "Open";
}