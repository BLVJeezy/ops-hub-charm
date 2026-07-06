import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useEffect, useMemo, useState } from "react";
import { Search as SearchIcon, User, FileText, ListChecks } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDate, normalizePhone } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { HealthDot } from "@/components/HealthDot";

const searchSchema = z.object({ q: z.string().optional() });

export const Route = createFileRoute("/_authenticated/search")({
  validateSearch: searchSchema,
  component: SearchPage,
});

type ClientHit = { id: string; name: string; city: string | null; phone: string | null; status: string | null; health: string | null };
type InvoiceHit = { id: string; invoice_number: number; amount: number; status: string; issue_date: string;
  clients: { name: string } | null };
type ActionHit = { id: string; action_description: string; due_date: string | null; status: string | null;
  clients: { id: string; name: string } | null };

function SearchPage() {
  const { q } = Route.useSearch();
  const navigate = useNavigate();
  const [term, setTerm] = useState(q || "");
  const [clients, setClients] = useState<ClientHit[]>([]);
  const [invoices, setInvoices] = useState<InvoiceHit[]>([]);
  const [actions, setActions] = useState<ActionHit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { setTerm(q || ""); }, [q]);

  const query = (q || "").trim();
  const phoneQ = normalizePhone(query);

  useEffect(() => {
    if (!query) { setClients([]); setInvoices([]); setActions([]); return; }
    setLoading(true);
    (async () => {
      const like = `%${query}%`;
      const clientFilter = phoneQ
        ? `name.ilike.${like},city.ilike.${like},phone.ilike.%${phoneQ}%`
        : `name.ilike.${like},city.ilike.${like}`;

      const [c, i, a] = await Promise.all([
        supabase.from("clients" as never).select("id,name,city,phone,status,health").or(clientFilter).limit(25),
        supabase.from("invoices" as never).select("id,invoice_number,amount,status,issue_date,clients:client_id(name)")
          .or(`clients.name.ilike.${like}`).limit(15),
        supabase.from("actions" as never).select("id,action_description,due_date,status,clients:client_id(id,name)")
          .ilike("action_description", like).limit(15),
      ]);
      setClients((c.data as ClientHit[]) || []);
      setInvoices((i.data as InvoiceHit[]) || []);
      setActions((a.data as ActionHit[]) || []);
      setLoading(false);
    })();
  }, [query, phoneQ]);

  const empty = !loading && query && clients.length === 0 && invoices.length === 0 && actions.length === 0;

  const totals = useMemo(() => ({
    clients: clients.length, invoices: invoices.length, actions: actions.length,
  }), [clients, invoices, actions]);

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Search</h1>

      <form
        onSubmit={(e) => { e.preventDefault(); navigate({ to: "/search", search: { q: term.trim() || undefined } }); }}
        className="relative mb-6"
      >
        <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          autoFocus
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Client name, city, phone, invoice, or action…"
          className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-card border border-border focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </form>

      {!query && (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <SearchIcon className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">Type to search across clients, invoices, and actions.</p>
        </div>
      )}

      {loading && <p className="text-sm text-muted-foreground">Searching…</p>}

      {empty && (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">No results for "{query}".</p>
        </div>
      )}

      {query && !empty && (
        <div className="space-y-6">
          {clients.length > 0 && (
            <section>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground mb-2">
                <User className="w-4 h-4" /> Clients ({totals.clients})
              </h2>
              <ul className="rounded-xl border border-border bg-card divide-y divide-border">
                {clients.map((c) => (
                  <li key={c.id}>
                    <Link to="/clients/$id" params={{ id: c.id }} className="flex items-center justify-between gap-3 p-3 hover:bg-accent/40">
                      <div className="flex items-center gap-2 min-w-0">
                        <HealthDot health={c.health} />
                        <div className="min-w-0">
                          <div className="truncate">{c.name}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {c.city || "—"} · {c.phone || "—"}
                          </div>
                        </div>
                      </div>
                      <StatusBadge status={c.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {invoices.length > 0 && (
            <section>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground mb-2">
                <FileText className="w-4 h-4" /> Invoices ({totals.invoices})
              </h2>
              <ul className="rounded-xl border border-border bg-card divide-y divide-border">
                {invoices.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <div className="truncate">#{inv.invoice_number} · {inv.clients?.name || "—"}</div>
                      <div className="text-xs text-muted-foreground">{formatDate(inv.issue_date)} · {inv.status}</div>
                    </div>
                    <span className="tabular-nums">{formatCurrency(inv.amount)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {actions.length > 0 && (
            <section>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground mb-2">
                <ListChecks className="w-4 h-4" /> Actions ({totals.actions})
              </h2>
              <ul className="rounded-xl border border-border bg-card divide-y divide-border">
                {actions.map((a) => (
                  <li key={a.id} className="p-3">
                    <div className="text-sm truncate">{a.action_description}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {a.clients?.name || "—"} · due {formatDate(a.due_date)} · {a.status}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
