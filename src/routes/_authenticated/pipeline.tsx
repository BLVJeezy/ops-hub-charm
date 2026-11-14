import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { supabase } from "@/integrations/supabase/client";
import { PIPELINE_STAGES, STAGE_COLORS } from "@/lib/constants";
import { HealthDot } from "@/components/HealthDot";
import { PhoneButtons } from "@/components/PhoneButtons";
import { todayISO } from "@/lib/format";
import { toast } from "sonner";
import type { ClientRow } from "@/components/ClientModal";
import { QuickAddProspect } from "@/components/QuickAddProspect";
import { Button } from "@/components/ui/button";
import { CurrencyToggle } from "@/components/CurrencyToggle";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, GripVertical, MapPin } from "lucide-react";

export const Route = createFileRoute("/_authenticated/pipeline")({
  component: Pipeline,
});

type Row = ClientRow & { id: string };

function Pipeline() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [quickAdd, setQuickAdd] = useState(false);
  const [dragging, setDragging] = useState(false);
  const navigate = useNavigate();

  async function load() {
    const { data, error } = await supabase.from("clients").select("*").in("status", ["Prospect", "Write-off"]).order("updated_at", { ascending: false });
    if (error) toast.error(error.message);
    setRows((data as unknown as Row[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const ch = supabase.channel("pipeline")
      .on("postgres_changes", { event: "*", schema: "public", table: "clients" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const byStage = useMemo(() => {
    const map: Record<string, Row[]> = {};
    for (const s of PIPELINE_STAGES) map[s] = [];
    for (const r of rows) (map[r.pipeline_stage] ||= []).push(r);
    return map;
  }, [rows]);

  async function moveClient(client: Row, newStage: string) {
    if (newStage === client.pipeline_stage) return;

    let newStatus = client.status;
    if (newStage === "Converted") newStatus = "Active";
    else if (newStage === "Write-off") newStatus = "Write-off";
    else if (client.status === "Active" || client.status === "Write-off") newStatus = "Prospect";

    if (newStage === "Write-off" && !client.writeoff_reason) {
      toast.error("Set a write-off reason from the client detail page first.");
      return;
    }

    setRows((prev) => prev.map((r) => r.id === client.id ? { ...r, pipeline_stage: newStage, status: newStatus } : r));

    const { error } = await supabase.from("clients")
      .update({ pipeline_stage: newStage, status: newStatus } as never)
      .eq("id", client.id);
    if (error) { toast.error(error.message); load(); return; }

    if (newStatus !== client.status) {
      const { data: u } = await supabase.auth.getUser();
      await supabase.from("client_status_log").insert({
        client: client.id, from_status: client.status, to_status: newStatus,
        date: todayISO(), created_by: u.user?.id ?? null,
      } as never);
    }
    toast.success(`Moved to ${newStage}`);
  }

  function onDragEnd(result: DropResult) {
    setDragging(false);
    const { destination, source, draggableId } = result;
    if (!destination || destination.droppableId === source.droppableId) return;
    const client = rows.find((r) => r.id === draggableId);
    if (client) moveClient(client, destination.droppableId);
  }

  const BOARD_STAGES = PIPELINE_STAGES.filter((s) => s !== "Converted");
  const FUNNEL = BOARD_STAGES.filter((s) => s !== "Write-off");
  const openCount = FUNNEL.reduce((n, s) => n + byStage[s].length, 0);
  const writeOffs = byStage["Write-off"]?.length ?? 0;
  const emptyStages = FUNNEL.filter((s) => byStage[s].length === 0);

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto lg:max-w-none">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Pipeline</h1>
        <div className="flex items-center gap-2">
          <div className="hidden sm:block"><CurrencyToggle /></div>
          <Button onClick={() => setQuickAdd(true)} className="gap-2 shrink-0 bg-white text-black hover:bg-white/90 rounded-full h-10 px-4"><Plus className="w-4 h-4" /> New Prospect</Button>
        </div>
      </div>
      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : (
        <>
        {/* Funnel: where every prospect sits, at a glance */}
        <div className="tone tone-violet rounded-2xl border p-4 mb-3">
          <div className="flex items-baseline justify-between">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold tabular-nums leading-none">{openCount}</span>
              <span className="text-sm text-muted-foreground">open prospect{openCount === 1 ? "" : "s"}</span>
            </div>
            {writeOffs > 0 && <span className="text-xs text-muted-foreground">{writeOffs} written off</span>}
          </div>
          <div className="flex gap-1 mt-3 h-9 items-end">
            {FUNNEL.map((stage) => {
              const n = byStage[stage].length;
              return (
                <div key={stage} className="flex-1 flex flex-col items-center gap-1" title={`${stage}: ${n}`}>
                  <span className={`text-[11px] tabular-nums ${n ? "font-semibold" : "text-muted-foreground/50"}`}>{n}</span>
                  <span
                    className="w-full rounded-full"
                    style={{ height: n ? 6 + Math.min(n, 4) * 3 : 3, backgroundColor: n ? STAGE_COLORS[stage] : "hsl(var(--muted))" }}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-[11px] text-muted-foreground mt-1.5 lg:hidden">
            <span>{FUNNEL[0]}</span>
            <span>{FUNNEL[FUNNEL.length - 1]}</span>
          </div>
          <div className="hidden lg:flex gap-1 text-[11px] text-muted-foreground mt-1.5">
            {FUNNEL.map((stage) => (
              <span key={stage} className={`flex-1 text-center truncate ${byStage[stage].length ? "text-foreground" : ""}`}>{stage}</span>
            ))}
          </div>
          {emptyStages.length > 0 && (
            <div className="lg:hidden text-[11px] text-muted-foreground mt-2">
              Empty: {emptyStages.join(", ")}
            </div>
          )}
        </div>
        <DragDropContext onDragStart={() => setDragging(true)} onDragEnd={onDragEnd}>
          <div className="flex flex-col gap-2 lg:grid lg:grid-cols-4 2xl:grid-cols-8 lg:gap-3 lg:items-start">
            {BOARD_STAGES.map((stage) => (
              <Droppable droppableId={stage} key={stage}>
                {(prov, snap) => (
                  <div
                    ref={prov.innerRef} {...prov.droppableProps}
                    className={`w-full min-w-0 rounded-xl border border-border bg-card/40 lg:block ${byStage[stage].length || dragging ? "" : "hidden"} ${snap.isDraggingOver ? "ring-2 ring-primary/30" : ""}`}
                  >
                    <div className={`px-4 2xl:px-3 py-2.5 lg:py-3 flex items-center justify-between gap-2 ${byStage[stage].length ? "border-b border-border" : "lg:border-b lg:border-border"}`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: STAGE_COLORS[stage] }} />
                        <span className={`font-semibold truncate 2xl:text-sm ${byStage[stage].length ? "" : "text-muted-foreground lg:text-foreground"}`}>{stage}</span>
                      </div>
                      <span className="text-xs tabular-nums bg-muted text-muted-foreground rounded-full px-2 py-0.5 shrink-0">{byStage[stage].length}</span>
                    </div>
                    <div className={`space-y-3 lg:p-2 lg:min-h-[76px] ${byStage[stage].length || snap.isDraggingOver ? "p-2" : "min-h-1"}`}>
                      {byStage[stage].length === 0 && (
                        <div className={`h-[86px] lg:h-[56px] items-center justify-center text-sm text-muted-foreground/60 lg:flex ${snap.isDraggingOver ? "flex" : "hidden"}`}>
                          Drop here
                        </div>
                      )}
                      {byStage[stage].map((r, idx) => (
                        <Draggable draggableId={r.id} index={idx} key={r.id}>
                          {(dp, ds) => (
                            <div
                              ref={dp.innerRef} {...dp.draggableProps}
                              className={`rounded-lg border border-border bg-card p-3 2xl:p-2.5 min-w-0 ${ds.isDragging ? "shadow-lg ring-1 ring-primary/40" : ""}`}
                            >
                              <div className="flex items-start gap-2">
                                <span {...dp.dragHandleProps} className="mt-0.5 text-muted-foreground/50 cursor-grab">
                                  <GripVertical className="w-4 h-4" />
                                </span>
                                <div className="flex-1 min-w-0">
                                  <button
                                    className="flex items-center gap-2 font-semibold text-left hover:underline max-w-full min-w-0"
                                    onClick={() => navigate({ to: "/clients/$id", params: { id: r.id } })}
                                  >
                                    <HealthDot health={r.health} />
                                    <span className="truncate">{r.name}</span>
                                  </button>
                                  {r.location && (
                                    <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1 min-w-0">
                                      <MapPin className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{r.location}</span>
                                    </div>
                                  )}
                                  {stage === "Write-off" && (
                                    <div className="text-sm text-muted-foreground mt-1">
                                      {r.writeoff_reason || <span className="text-destructive">Reason not set</span>}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center justify-between mt-2 gap-2">
                                <PhoneButtons phone={r.contact_phone} />
                                <Select value={r.pipeline_stage} onValueChange={(v) => moveClient(r, v)}>
                                  <SelectTrigger className="h-9 w-auto min-w-[130px] 2xl:min-w-0 2xl:w-full text-sm ml-auto">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {PIPELINE_STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {prov.placeholder}
                    </div>
                  </div>
                )}
              </Droppable>
            ))}
          </div>
        </DragDropContext>
        </>
      )}
      <QuickAddProspect open={quickAdd} onOpenChange={setQuickAdd} onSaved={() => load()} />
    </div>
  );
}
