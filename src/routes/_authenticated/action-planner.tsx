import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { ActionStatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { ActionModal, type ActionRow } from "@/components/ActionModal";
import { formatDate, daysUntil } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/action-planner")({
  component: ActionPlanner,
});

type Row = ActionRow & { id: string; created_at: string; clients?: { name: string } | null };
type Client = { id: string; name: string };

function ActionPlanner() {
  const [rows, setRows] = useState<Row[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [tab, setTab] = useState("Open");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [a, c] = await Promise.all([
      supabase.from("actions").select("*, clients:client(name)").order("due_date", { ascending: true, nullsFirst: false }),
      supabase.from("clients").select("id,name").order("name"),
    ]);
    if (a.error) toast.error(a.error.message);
    setRows((a.data as unknown as Row[]) ?? []);
    setClients((c.data as unknown as Client[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const ch = supabase.channel("actions-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "actions" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const filtered = useMemo(() => {
    let list = rows;
    if (tab === "Open") list = list.filter((r) => r.status !== "Completed");
    else if (tab === "Overdue") list = list.filter((r) => r.status !== "Completed" && r.due_date && (daysUntil(r.due_date) ?? 1) < 0);
    else if (tab === "Completed") list = list.filter((r) => r.status === "Completed");
    if (clientFilter !== "all") list = list.filter((r) => r.client === clientFilter);
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter((r) =>
        r.action_description.toLowerCase().includes(s) ||
        (r.clients?.name || "").toLowerCase().includes(s),
      );
    }
    return list;
  }, [rows, tab, clientFilter, q]);

  async function toggleComplete(r: Row, done: boolean) {
    const status = done ? "Completed" : "Planned";
    const { error } = await supabase.from("actions").update({ status } as never).eq("id", r.id);
    if (error) toast.error(error.message);
  }

  const counts = {
    Open: rows.filter((r) => r.status !== "Completed").length,
    Overdue: rows.filter((r) => r.status !== "Completed" && r.due_date && (daysUntil(r.due_date) ?? 1) < 0).length,
    Completed: rows.filter((r) => r.status === "Completed").length,
    All: rows.length,
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold">Action Planner</h1>
        <Button onClick={() => { setEditing(null); setModalOpen(true); }} className="gap-2">
          <Plus className="w-4 h-4" /> New action
        </Button>
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            {(["Open", "Overdue", "Completed", "All"] as const).map((t) => (
              <TabsTrigger key={t} value={t}>
                {t} <span className="ml-1.5 text-xs opacity-60">{counts[t]}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Select value={clientFilter} onValueChange={setClientFilter}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All clients</SelectItem>
            {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="flex-1 min-w-[200px] max-w-md" />
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={ListChecks} title="No actions" description="Create an action to get started." />
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((r) => {
              const days = r.due_date ? daysUntil(r.due_date) : null;
              const overdue = days !== null && days < 0 && r.status !== "Completed";
              const done = r.status === "Completed";
              return (
                <li key={r.id} className="p-3 flex items-start gap-3 hover:bg-muted/20">
                  <Checkbox checked={done} onCheckedChange={(v) => toggleComplete(r, !!v)} className="mt-1" />
                  <button className="flex-1 text-left" onClick={() => { setEditing(r); setModalOpen(true); }}>
                    <div className={`text-sm ${done ? "line-through text-muted-foreground" : ""}`}>
                      {r.action_description}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                      {r.clients?.name && (
                        <Link to="/clients/$id" params={{ id: r.client }} className="hover:underline"
                          onClick={(e) => e.stopPropagation()}>
                          {r.clients.name}
                        </Link>
                      )}
                      {r.due_date && (
                        <>
                          <span>·</span>
                          <span className={overdue ? "text-[hsl(var(--destructive))] font-medium" : ""}>
                            Due {formatDate(r.due_date)}
                            {days !== null && ` (${days}d)`}
                          </span>
                        </>
                      )}
                      <span>·</span>
                      <span>{r.waiting_period}</span>
                    </div>
                  </button>
                  <ActionStatusBadge status={r.status} />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ActionModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        initial={editing ?? undefined}
        clients={clients}
        onSaved={() => load()}
      />
    </div>
  );
}
