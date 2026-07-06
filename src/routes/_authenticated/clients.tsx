import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Search as SearchIcon, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge } from "@/components/StatusBadge";
import { HealthDot } from "@/components/HealthDot";
import { PhoneButtons } from "@/components/PhoneButtons";
import { EmptyState } from "@/components/EmptyState";
import { ClientModal, type ClientRow } from "@/components/ClientModal";
import { formatCurrency, formatDate, daysUntil } from "@/lib/format";
import { computeMRR } from "@/lib/fees";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/clients")({
  component: ClientsPage,
});

type Row = ClientRow & { id: string };

function ClientsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("Active");
  const [q, setQ] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("clients").select("*").order("name");
    if (error) toast.error(error.message);
    setRows((data as unknown as Row[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const ch = supabase
      .channel("clients-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "clients" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const filtered = useMemo(() => {
    let list = rows;
    if (tab !== "All") list = list.filter((r) => r.status === tab);
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter((r) =>
        r.name.toLowerCase().includes(s) ||
        (r.contact_name || "").toLowerCase().includes(s) ||
        (r.location || "").toLowerCase().includes(s) ||
        (r.sector || "").toLowerCase().includes(s),
      );
    }
    return list;
  }, [rows, tab, q]);

  const counts = useMemo(() => ({
    All: rows.length,
    Active: rows.filter((r) => r.status === "Active").length,
    Paused: rows.filter((r) => r.status === "Paused").length,
    Prospect: rows.filter((r) => r.status === "Prospect").length,
    "Write-off": rows.filter((r) => r.status === "Write-off").length,
  }), [rows]);

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto pb-24">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 mb-4">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight truncate">Clients</h1>
        <Button onClick={() => setModalOpen(true)} className="gap-2 shrink-0 bg-white text-black hover:bg-white/90 rounded-full h-10 px-4">
          <Plus className="w-4 h-4" /> New Client
        </Button>
      </div>

      <div className="space-y-2 mb-4">
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="w-full grid grid-cols-5">
            {(["Active", "Paused", "Prospect", "Write-off", "All"] as const).map((t) => (
              <TabsTrigger key={t} value={t} className="text-xs">
                {t.replace("Write-off", "W/O")} <span className="ml-1 opacity-60">{counts[t]}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative w-full">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="pl-9" />
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Users} title="No clients"
          description={q ? "No results for this search." : "Create your first client to get started."} />
      ) : (
        <ul className="space-y-2">
          {filtered.map((r) => {
            const mrr = computeMRR(r);
            const days = daysUntil(r.renewal_date);
            const warn = days !== null && days <= 30;
            return (
              <li key={r.id} className="rounded-2xl border border-border bg-card p-4 hover:border-white/20 transition">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <HealthDot health={r.health} />
                      <Link to="/clients/$id" params={{ id: r.id }} className="font-semibold hover:underline truncate">
                        {r.name}
                      </Link>
                    </div>
                    {r.location && <div className="text-xs text-muted-foreground mt-0.5 truncate">{r.location}{r.sector ? ` · ${r.sector}` : ""}</div>}
                    <div className="text-xs text-muted-foreground mt-1.5 flex items-center gap-2 flex-wrap">
                      <span className="tabular-nums">MRR {formatCurrency(mrr)}</span>
                      {r.setup_fee ? <><span>·</span><span className="tabular-nums">Setup {formatCurrency(r.setup_fee)}</span></> : null}
                      {r.renewal_date && (
                        <>
                          <span>·</span>
                          <span className={warn ? "text-destructive font-medium" : ""}>
                            Renews {formatDate(r.renewal_date)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <StatusBadge status={r.status} />
                    <PhoneButtons phone={r.contact_phone} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ClientModal open={modalOpen} onOpenChange={setModalOpen} onSaved={() => load()} />
    </div>
  );
}
