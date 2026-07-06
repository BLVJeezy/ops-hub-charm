import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { PIPELINE_STAGES, STAGE_COLORS } from "@/lib/constants";
import { HealthDot } from "@/components/HealthDot";
import { formatCurrency, todayISO } from "@/lib/format";
import { computeMRR } from "@/lib/fees";
import { toast } from "sonner";
import type { ClientRow } from "@/components/ClientModal";
import { QuickAddProspect } from "@/components/QuickAddProspect";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

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
    setLoading(true);
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

  async function onDragEnd(result: DropResult) {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId) return;
    const newStage = destination.droppableId;
    const client = rows.find((r) => r.id === draggableId);
    if (!client) return;

    // Stage → status sync
    let newStatus = client.status;
    if (newStage === "Converted") newStatus = "Active";
    else if (newStage === "Write-off") newStatus = "Write-off";
    else if (client.status === "Active" || client.status === "Write-off") newStatus = "Prospect";

    if (newStage === "Write-off" && !client.writeoff_reason) {
      toast.error("Set a write-off reason from the client detail page first.");
      return;
    }

    // optimistic
    setRows((prev) => prev.map((r) => r.id === draggableId ? { ...r, pipeline_stage: newStage, status: newStatus } : r));

    const { error } = await supabase.from("clients")
      .update({ pipeline_stage: newStage, status: newStatus } as never)
      .eq("id", draggableId);
    if (error) { toast.error(error.message); load(); return; }

    if (newStatus !== client.status) {
      const { data: u } = await supabase.auth.getUser();
      await supabase.from("client_status_log").insert({
        client: draggableId, from_status: client.status, to_status: newStatus,
        date: todayISO(), created_by: u.user?.id ?? null,
      } as never);
    }
    toast.success(`Moved to ${newStage}`);
  }

  const BOARD_STAGES = PIPELINE_STAGES.filter((s) => s !== "Converted");

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Pipeline</h1>
        <Button onClick={() => setQuickAdd(true)} className="gap-2"><Plus className="w-4 h-4" /> New prospect</Button>
      </div>
      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex gap-3 overflow-x-auto pb-4">
            {BOARD_STAGES.map((stage) => (
              <Droppable droppableId={stage} key={stage}>
                {(prov, snap) => (
                  <div
                    ref={prov.innerRef} {...prov.droppableProps}
                    className={`shrink-0 w-72 rounded-xl border border-border bg-card/50 flex flex-col ${snap.isDraggingOver ? "ring-2 ring-primary/30" : ""}`}
                  >
                    <div className="px-3 py-2 border-b border-border flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: STAGE_COLORS[stage] }} />
                        <span className="text-sm font-medium">{stage}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{byStage[stage].length}</span>
                    </div>
                    <div className="p-2 space-y-2 min-h-[120px] flex-1">
                      {byStage[stage].map((r, idx) => (
                        <Draggable draggableId={r.id} index={idx} key={r.id}>
                          {(dp, ds) => (
                            <div
                              ref={dp.innerRef} {...dp.draggableProps} {...dp.dragHandleProps}
                              onClick={() => navigate({ to: "/clients/$id", params: { id: r.id } })}
                              className={`rounded-lg border border-border bg-card p-3 cursor-pointer hover:border-primary/40 transition ${ds.isDragging ? "shadow-lg ring-1 ring-primary/40" : ""}`}
                            >
                              <div className="flex items-center gap-2">
                                <HealthDot health={r.health} />
                                <span className="font-medium text-sm truncate">{r.name}</span>
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">{r.sector}{r.location ? ` · ${r.location}` : ""}</div>
                              <div className="text-xs text-muted-foreground mt-1">MRR {formatCurrency(computeMRR(r))}</div>
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
