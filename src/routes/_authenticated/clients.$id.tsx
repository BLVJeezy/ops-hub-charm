import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useMemo } from "react";
import { ArrowLeft, Pencil, Phone, Mail, MessageSquarePlus, Plus, Download, Trash2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge, StageBadge, ActionStatusBadge } from "@/components/StatusBadge";
import { HealthDot } from "@/components/HealthDot";
import { PhoneButtons } from "@/components/PhoneButtons";
import { ClientModal, type ClientRow } from "@/components/ClientModal";
import { ContactLogModal } from "@/components/ContactLogModal";
import { ActionModal, type ActionRow } from "@/components/ActionModal";
import { InvoiceModal, type InvoiceRow } from "@/components/InvoiceModal";
import { formatCurrency, formatDate, daysUntil, daysBetween, durationLabel, todayISO } from "@/lib/format";
import { clientMRR, clientMonthlyFee } from "@/lib/fees";
import { downloadInvoicePDF, type LineItem } from "@/lib/invoice-pdf";
import { canEditClient, canEditActions, isAdmin } from "@/lib/permissions";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/clients/$id")({
  component: ClientDetail,
});

type StatusLog = { id: string; from_status: string | null; to_status: string; date: string; created_at: string };
type ContactLog = { id: string; date: string; channel: string; direction: string; note: string; created_at: string };
type Action = ActionRow & { id: string };
type Invoice = InvoiceRow & { id: string; invoice_number: number };
type Expense = { id: string; name: string; category: string; monthly_cost: number; linked_client: string | null };

function ClientDetail() {
  const { id } = Route.useParams();
  const { role } = useAuth();
  const [client, setClient] = useState<(ClientRow & { id: string }) | null>(null);
  const [statusLog, setStatusLog] = useState<StatusLog[]>([]);
  const [contactLog, setContactLog] = useState<ContactLog[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [actionOpen, setActionOpen] = useState(false);
  const [editingAction, setEditingAction] = useState<Action | null>(null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [c, s, l, a, i, e] = await Promise.all([
      supabase.from("clients").select("*").eq("id", id).maybeSingle(),
      supabase.from("client_status_log").select("*").eq("client", id).order("date", { ascending: true }),
      supabase.from("contact_log").select("*").eq("client", id).order("date", { ascending: false }),
      supabase.from("actions").select("*").eq("client", id).order("due_date", { ascending: true, nullsFirst: false }),
      supabase.from("invoices").select("*").eq("client", id).order("invoice_number", { ascending: false }),
      supabase.from("expenses").select("*").eq("linked_client", id),
    ]);
    if (c.error) toast.error(c.error.message);
    setClient((c.data as unknown as ClientRow & { id: string }) ?? null);
    setStatusLog((s.data as unknown as StatusLog[]) ?? []);
    setContactLog((l.data as unknown as ContactLog[]) ?? []);
    setActions((a.data as unknown as Action[]) ?? []);
    setInvoices((i.data as unknown as Invoice[]) ?? []);
    setExpenses((e.data as unknown as Expense[]) ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const canEdit = canEditClient(role, client?.status);
  const canActions = canEditActions(role, client?.status);
  const admin = isAdmin(role);

  const mrr = client ? clientMRR(client) : 0;
  const monthlyFee = client ? clientMonthlyFee(client) : 0;
  const clientCosts = useMemo(() => expenses.reduce((s, e) => s + Number(e.monthly_cost || 0), 0), [expenses]);
  const netMargin = monthlyFee - clientCosts;

  const outstanding = useMemo(() => invoices.filter((i) => i.status !== "Paid").reduce((s, i) => s + Number(i.total || 0), 0), [invoices]);
  const paidTotal = useMemo(() => invoices.filter((i) => i.status === "Paid").reduce((s, i) => s + Number(i.total || 0), 0), [invoices]);

  // Status history durations (§4.19)
  const statusTimeline = useMemo(() => {
    const entries = statusLog.map((s, idx) => {
      const next = statusLog[idx + 1];
      const end = next ? next.date : todayISO();
      return { ...s, days: daysBetween(s.date, end), current: !next };
    });
    return entries.reverse();
  }, [statusLog]);

  async function markPaid(inv: Invoice) {
    const { error } = await supabase.from("invoices").update({ status: "Paid" } as never).eq("id", inv.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Invoice #${inv.invoice_number} marked paid`);
    load();
  }

  async function deleteInvoice(inv: Invoice) {
    if (!confirm(`Delete invoice #${inv.invoice_number}?`)) return;
    const { error } = await supabase.from("invoices").delete().eq("id", inv.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Invoice deleted");
    load();
  }

  async function deleteAction(a: Action) {
    if (!confirm("Delete this action?")) return;
    const { error } = await supabase.from("actions").delete().eq("id", a.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Action deleted");
    load();
  }

  function pdfFor(inv: Invoice) {
    downloadInvoicePDF({
      invoice_number: inv.invoice_number,
      date: inv.date,
      client_name: inv.client_name || client?.name || "",
      client_address: inv.client_address,
      client_vat_number: inv.client_vat_number,
      line_items: (inv.line_items as LineItem[]) ?? [],
      vat_note: inv.vat_note,
      total: Number(inv.total || 0),
    });
  }

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!client) {
    return (
      <div className="p-6">
        <Link to="/clients" className="text-sm text-muted-foreground">← Back</Link>
        <p className="mt-4">Client not found.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <Link to="/clients" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to clients
      </Link>

      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div className="flex items-start gap-3">
          <HealthDot health={client.health} size={14} />
          <div>
            <h1 className="text-2xl font-semibold">{client.name}</h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <StatusBadge status={client.status} />
              {(client.status === "Prospect" || client.status === "Write-off") && <StageBadge stage={client.pipeline_stage} />}
              <span className="text-xs text-muted-foreground">{client.sector}</span>
              {client.location && <span className="text-xs text-muted-foreground">· {client.location}</span>}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setLogOpen(true)} className="gap-2">
            <MessageSquarePlus className="w-4 h-4" /> Log contact
          </Button>
          {canEdit && (
            <Button onClick={() => setEditOpen(true)} className="gap-2">
              <Pencil className="w-4 h-4" /> Edit
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Stat label="MRR" value={formatCurrency(mrr)} />
        <Stat label="Net margin /mo" value={formatCurrency(netMargin)} accent={netMargin < 0 ? "text-destructive" : undefined} />
        <Stat label="Outstanding" value={formatCurrency(outstanding)} />
        <Stat label="Paid total" value={formatCurrency(paidTotal)} />
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="invoices">Invoices ({invoices.length})</TabsTrigger>
          <TabsTrigger value="expenses">Expenses ({expenses.length})</TabsTrigger>
          <TabsTrigger value="actions">Actions ({actions.length})</TabsTrigger>
          <TabsTrigger value="contact">Contact log ({contactLog.length})</TabsTrigger>
          <TabsTrigger value="status">Status history ({statusLog.length})</TabsTrigger>
        </TabsList>

        {/* ===== OVERVIEW ===== */}
        <TabsContent value="overview" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Panel title="Contact">
              <Row k="Name" v={client.contact_name} />
              <Row k="Phone" v={client.contact_phone ? (
                <span className="flex items-center gap-2">{client.contact_phone}<PhoneButtons phone={client.contact_phone} /></span>
              ) : null} />
              <Row k="Email" v={client.contact_email ? (
                <a href={`mailto:${client.contact_email}`} className="text-primary hover:underline inline-flex items-center gap-1">
                  <Mail className="w-3 h-3" />{client.contact_email}
                </a>
              ) : null} />
              <Row k="VAT" v={client.vat_number} />
              <Row k="Billing address" v={client.billing_address} />
            </Panel>

            <Panel title="Monthly cost & margin">
              <Row k="Monthly-billed fees" v={formatCurrency(monthlyFee)} />
              {expenses.map((e) => (
                <Row key={e.id} k={e.name} v={<span className="text-destructive">−{formatCurrency(e.monthly_cost)}</span>} />
              ))}
              {expenses.length === 0 && <Row k="Linked expenses" v={<span className="text-muted-foreground">none</span>} />}
              <div className="border-t border-border pt-2 mt-2">
                <Row k="Net margin" v={<span className={netMargin < 0 ? "text-destructive font-semibold" : "font-semibold"}>{formatCurrency(netMargin)}</span>} />
              </div>
            </Panel>

            <Panel title="SEO package">
              <Row k="Package" v={client.seo_package} />
              <Row k="Billing" v={client.billing_frequency} />
              <Row k="Monthly" v={client.monthly_fee ? formatCurrency(client.monthly_fee) : null} />
              <Row k="Yearly" v={client.yearly_fee ? formatCurrency(client.yearly_fee) : null} />
              <Row k="Setup" v={client.setup_fee ? formatCurrency(client.setup_fee) : null} />
              <Row k="Start" v={formatDate(client.seo_start_date)} />
              <Row k="End" v={formatDate(client.seo_end_date)} />
            </Panel>

            {client.website_needed && (
              <Panel title="Website">
                <Row k="Billing" v={client.website_billing_frequency} />
                <Row k="Setup" v={client.website_setup_fee ? formatCurrency(client.website_setup_fee) : null} />
                <Row k="Monthly" v={client.website_monthly_fee ? formatCurrency(client.website_monthly_fee) : null} />
                <Row k="Yearly" v={client.website_yearly_fee ? formatCurrency(client.website_yearly_fee) : null} />
              </Panel>
            )}

            <Panel title="Dates">
              <Row k="Contract start" v={formatDate(client.contract_start_date)} />
              <Row k="Renewal" v={formatDate(client.renewal_date)} />
              <Row k="Next follow-up" v={formatDate(client.next_followup_date)} />
            </Panel>

            {client.writeoff_reason && (
              <Panel title="Write-off reason" className="border-destructive/50">
                <p className="text-sm text-destructive">{client.writeoff_reason}</p>
              </Panel>
            )}

            {client.notes && (
              <Panel title="Notes" className="md:col-span-2">
                <p className="text-sm whitespace-pre-wrap">{client.notes}</p>
              </Panel>
            )}
          </div>
        </TabsContent>

        {/* ===== EXPENSES ===== */}
        <TabsContent value="expenses" className="mt-4">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <Stat label="Monthly-billed fees" value={formatCurrency(monthlyFee)} />
            <Stat label="Net margin /mo" value={formatCurrency(netMargin)} accent={netMargin < 0 ? "text-destructive" : undefined} />
          </div>
          <div className="rounded-xl border border-border bg-card divide-y divide-border">
            {expenses.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground text-center">No expenses linked to this client.</div>
            ) : expenses.map((e) => (
              <div key={e.id} className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{e.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{e.category}</div>
                </div>
                <div className="text-sm font-semibold text-destructive shrink-0 tabular-nums">
                  −{formatCurrency(e.monthly_cost)}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>


        {/* ===== ACTIONS ===== */}
        <TabsContent value="actions" className="mt-4">
          <div className="flex justify-end mb-3">
            {canActions && (
              <Button size="sm" onClick={() => { setEditingAction(null); setActionOpen(true); }} className="gap-2">
                <Plus className="w-4 h-4" /> New action
              </Button>
            )}
          </div>
          <div className="rounded-xl border border-border bg-card divide-y divide-border">
            {actions.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground text-center">No actions yet.</div>
            ) : actions.map((a) => {
              const d = daysUntil(a.due_date);
              const overdue = d !== null && d < 0 && a.status !== "Completed" && a.waiting_period !== "Ongoing";
              return (
                <div key={a.id} className="p-4 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{a.action_description}</span>
                      <ActionStatusBadge status={a.status} />
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Due: <span className={overdue ? "text-destructive" : ""}>{formatDate(a.due_date)}{overdue ? ` (${Math.abs(d!)}d overdue)` : ""}</span>
                      {a.result && <> · Result: <span className="text-foreground">{a.result}</span></>}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {canActions && (
                      <Button variant="ghost" size="icon" onClick={() => { setEditingAction(a); setActionOpen(true); }}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                    )}
                    {admin && (
                      <Button variant="ghost" size="icon" onClick={() => deleteAction(a)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        {/* ===== INVOICES ===== */}
        <TabsContent value="invoices" className="mt-4">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <Stat label="Outstanding" value={formatCurrency(outstanding)} />
            <Stat label="Paid" value={formatCurrency(paidTotal)} />
          </div>
          <div className="flex justify-end mb-3">
            {canActions && (
              <Button size="sm" onClick={() => { setEditingInvoice(null); setInvoiceOpen(true); }} className="gap-2">
                <Plus className="w-4 h-4" /> New invoice
              </Button>
            )}
          </div>
          <div className="rounded-xl border border-border bg-card divide-y divide-border">
            {invoices.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground text-center">No invoices yet.</div>
            ) : invoices.map((inv) => (
              <div key={inv.id} className="p-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="text-sm font-medium">#{inv.invoice_number} · {formatCurrency(inv.total)}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {formatDate(inv.date)} · <span className={
                      inv.status === "Paid" ? "text-green-400" : inv.status === "Sent" ? "text-amber-400" : "text-muted-foreground"
                    }>{inv.status}</span>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" title="Download PDF" onClick={() => pdfFor(inv)}>
                    <Download className="w-4 h-4" />
                  </Button>
                  {canActions && inv.status !== "Paid" && (
                    <Button variant="ghost" size="icon" title="Mark paid" onClick={() => markPaid(inv)}>
                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                    </Button>
                  )}
                  {canActions && (
                    <Button variant="ghost" size="icon" title="Edit" onClick={() => { setEditingInvoice(inv); setInvoiceOpen(true); }}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                  )}
                  {admin && (
                    <Button variant="ghost" size="icon" title="Delete" onClick={() => deleteInvoice(inv)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* ===== CONTACT LOG ===== */}
        <TabsContent value="contact" className="mt-4">
          <div className="rounded-xl border border-border bg-card divide-y divide-border">
            {contactLog.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground text-center">No contact entries yet.</div>
            ) : contactLog.map((c) => (
              <div key={c.id} className="p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <span>{formatDate(c.date)}</span>
                  <span>·</span>
                  <span>{c.direction}</span>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1">
                    {c.channel === "Phone" ? <Phone className="w-3 h-3" /> : null}
                    {c.channel}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{c.note}</p>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* ===== STATUS HISTORY ===== */}
        <TabsContent value="status" className="mt-4">
          <div className="rounded-xl border border-border bg-card divide-y divide-border">
            {statusTimeline.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground text-center">No status changes yet.</div>
            ) : statusTimeline.map((s) => (
              <div key={s.id} className="p-4 flex items-center gap-3 text-sm flex-wrap">
                <span className="text-xs text-muted-foreground w-24">{formatDate(s.date)}</span>
                {s.from_status && <><StatusBadge status={s.from_status} /><span className="text-muted-foreground">→</span></>}
                <StatusBadge status={s.to_status} />
                <span className="text-xs text-muted-foreground ml-auto">
                  {s.current ? `currently for ${durationLabel(s.days)}` : durationLabel(s.days)}
                </span>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <ClientModal open={editOpen} onOpenChange={setEditOpen} initial={client} onSaved={() => load()} />
      <ContactLogModal clientId={id} open={logOpen} onOpenChange={setLogOpen} onSaved={() => load()} />
      <ActionModal
        open={actionOpen} onOpenChange={setActionOpen}
        initial={editingAction ?? undefined}
        defaultClientId={id}
        clients={[{ id: client.id, name: client.name }]}
        onSaved={() => load()}
      />
      <InvoiceModal
        open={invoiceOpen} onOpenChange={setInvoiceOpen}
        initial={editingInvoice ?? { client: client.id, client_name: client.name, client_address: client.billing_address, client_vat_number: client.vat_number } as Partial<InvoiceRow>}
        clients={[{ id: client.id, name: client.name, billing_address: client.billing_address, vat_number: client.vat_number }]}
        onSaved={() => load()}
      />
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${accent ?? ""}`}>{value}</div>
    </div>
  );
}

function Panel({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-border bg-card p-4 ${className ?? ""}`}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-3">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right">{v || <span className="text-muted-foreground">—</span>}</span>
    </div>
  );
}
