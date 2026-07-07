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
    const { destination, source, draggableId } = result;
    if (!destination || destination.droppableId === source.droppableId) return;
    const client = rows.find((r) => r.id === draggableId);
    if (client) moveClient(client, destination.droppableId);
  }

  const BOARD_STAGES = PIPELINE_STAGES.filter((s) => s !== "Converted");

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto lg:max-w-none">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Pipeline</h1>
        <Button onClick={() => setQuickAdd(true)} className="gap-2 shrink-0 bg-white text-black hover:bg-white/90 rounded-full h-10 px-4"><Plus className="w-4 h-4" /> New Prospect</Button>
      </div>
      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex flex-col gap-4 lg:flex-row lg:gap-3 lg:overflow-x-auto lg:pb-4 lg:items-start">
            {BOARD_STAGES.map((stage) => (
              <Droppable droppableId={stage} key={stage}>
                {(prov, snap) => (
                  <div
                    ref={prov.innerRef} {...prov.droppableProps}
                    className={`w-full lg:w-72 lg:shrink-0 rounded-xl border border-border bg-card/40 ${snap.isDraggingOver ? "ring-2 ring-primary/30" : ""}`}
                  >
                    <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: STAGE_COLORS[stage] }} />
                        <span className="font-semibold">{stage}</span>
                      </div>
                      <span className="text-xs tabular-nums bg-muted text-muted-foreground rounded-full px-2 py-0.5">{byStage[stage].length}</span>
                    </div>
                    <div className="p-3 space-y-3 min-h-[110px]">
                      {byStage[stage].length === 0 && (
                        <div className="h-[86px] flex items-center justify-center text-sm text-muted-foreground/60">
                          Drop here
                        </div>
                      )}
                      {byStage[stage].map((r, idx) => (
                        <Draggable draggableId={r.id} index={idx} key={r.id}>
                          {(dp, ds) => (
                            <div
                              ref={dp.innerRef} {...dp.draggableProps}
                              className={`rounded-lg border border-border bg-card p-3 ${ds.isDragging ? "shadow-lg ring-1 ring-primary/40" : ""}`}
                            >
                              <div className="flex items-start gap-2">
                                <span {...dp.dragHandleProps} className="mt-0.5 text-muted-foreground/50 cursor-grab">
                                  <GripVertical className="w-4 h-4" />
                                </span>
                                <div className="flex-1 min-w-0">
                                  <button
                                    className="flex items-center gap-2 font-semibold text-left hover:underline"
                                    onClick={() => navigate({ to: "/clients/$id", params: { id: r.id } })}
                                  >
                                    <HealthDot health={r.health} />
                                    <span className="truncate">{r.name}</span>
                                  </button>
                                  {r.location && (
                                    <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                                      <MapPin className="w-3.5 h-3.5" /> {r.location}
                                    </div>
                                  )}
                                  {stage === "Write-off" && (
                                    <div className="text-sm text-muted-foreground mt-1">
                                      {r.writeoff_reason || <span className="text-destructive">Reason not set</span>}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center justify-between mt-3 gap-2">
                                <PhoneButtons phone={r.contact_phone} />
                                <Select value={r.pipeline_stage} onValueChange={(v) => moveClient(r, v)}>
                                  <SelectTrigger className="h-8 w-auto min-w-[130px] text-sm ml-auto">
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
      )}
      <QuickAddProspect open={quickAdd} onOpenChange={setQuickAdd} onSaved={() => load()} />
    </div>
  );
}
