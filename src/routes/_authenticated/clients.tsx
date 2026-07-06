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
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold">Clients</h1>
        <Button onClick={() => setModalOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" /> New client
        </Button>
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            {(["Active", "Paused", "Prospect", "Write-off", "All"] as const).map((t) => (
              <TabsTrigger key={t} value={t}>
                {t} <span className="ml-1.5 text-xs opacity-60">{counts[t]}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="pl-9" />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={Users} title="No clients"
            description={q ? "No results for this search." : "Create your first client to get started."} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2.5">Client</th>
                  <th className="text-left px-4 py-2.5">Sector</th>
                  <th className="text-left px-4 py-2.5">Status</th>
                  <th className="text-left px-4 py-2.5">Contact</th>
                  <th className="text-right px-4 py-2.5">MRR</th>
                  <th className="text-right px-4 py-2.5">Setup</th>
                  <th className="text-left px-4 py-2.5">Renewal</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const mrr = computeMRR(r);
                  const days = daysUntil(r.renewal_date);
                  const warn = days !== null && days <= 30;
                  return (
                    <tr key={r.id} className="border-t border-border hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <HealthDot health={r.health} />
                          <Link to="/clients/$id" params={{ id: r.id }} className="font-medium hover:underline">
                            {r.name}
                          </Link>
                        </div>
                        {r.location && <div className="text-xs text-muted-foreground mt-0.5">{r.location}</div>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{r.sector}</td>
                      <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{r.contact_name || "—"}</span>
                          <PhoneButtons phone={r.contact_phone} />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(mrr)}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {r.setup_fee ? formatCurrency(r.setup_fee) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {r.renewal_date ? (
                          <span className={warn ? "text-[hsl(var(--destructive))] font-medium" : ""}>
                            {formatDate(r.renewal_date)}
                            {days !== null && <span className="text-xs opacity-70 ml-1">({days}d)</span>}
                          </span>
                        ) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ClientModal open={modalOpen} onOpenChange={setModalOpen} onSaved={() => load()} />
    </div>
  );
}
