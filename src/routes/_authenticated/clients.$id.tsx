import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, useCallback, useMemo } from "react";
import { ArrowLeft, Pencil, Mail, MapPin, Phone, MessageSquare, Plus, FileText, Trash2, Globe, Search as SearchIcon, StickyNote, History, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge, StageBadge, ActionStatusBadge } from "@/components/StatusBadge";
import { HealthDot } from "@/components/HealthDot";
import { PhoneButtons } from "@/components/PhoneButtons";
import { ClientModal, type ClientRow } from "@/components/ClientModal";
import { ContactLogModal } from "@/components/ContactLogModal";
import { ActionModal, type ActionRow } from "@/components/ActionModal";
import { InvoiceModal, type InvoiceRow } from "@/components/InvoiceModal";
import { formatCurrency, formatDate, daysUntil, daysBetween, durationLabel, todayISO } from "@/lib/format";
import { clientMonthlyFee } from "@/lib/fees";
import { downloadInvoicePDF, type LineItem } from "@/lib/invoice-pdf";
import { canEditClient, canEditActions, isAdmin as isAdminRole } from "@/lib/permissions";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { sendClientDocument } from "@/lib/document-send.functions";

export const Route = createFileRoute("/_authenticated/clients/$id")({
  component: ClientDetail,
});

type StatusLog = { id: string; from_status: string | null; to_status: string; date: string };
type ContactLog = { id: string; date: string; channel: string; direction: string; note: string };
type Action = ActionRow & { id: string };
type Invoice = InvoiceRow & { id: string; invoice_number: number };
type Expense = { id: string; name: string; monthly_cost: number };
type ClientDocument = { id: string; file_name: string; storage_path: string; file_size: number | null; content_type: string | null; created_at: string; title: string | null; document_date: string | null; last_sent_at: string | null; last_sent_to: string | null };

const CHANNEL_ICON: Record<string, string> = {
  WhatsApp: "💬", Phone: "📞", Email: "✉️", "In person": "🤝", Other: "📝",
};

function ClientDetail() {
  const { id } = Route.useParams();
  const { role } = useAuth();
  const navigate = useNavigate();
  const [client, setClient] = useState<(ClientRow & { id: string }) | null>(null);
  const [statusLog, setStatusLog] = useState<StatusLog[]>([]);
  const [contactLog, setContactLog] = useState<ContactLog[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [documents, setDocuments] = useState<ClientDocument[]>([]);
  const [uploading, setUploading] = useState(false);
  const [editingDoc, setEditingDoc] = useState<ClientDocument | null>(null);
  const [sendingDocId, setSendingDocId] = useState<string | null>(null);
  const sendDocFn = useServerFn(sendClientDocument);
  const [editOpen, setEditOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [actionOpen, setActionOpen] = useState(false);
  const [editingAction, setEditingAction] = useState<Action | null>(null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [c, s, l, a, i, e, d] = await Promise.all([
      supabase.from("clients").select("*").eq("id", id).maybeSingle(),
      supabase.from("client_status_log").select("*").eq("client", id).order("date", { ascending: true }),
      supabase.from("contact_log").select("*").eq("client", id).order("date", { ascending: false }),
      supabase.from("actions").select("*").eq("client", id).order("due_date", { ascending: true, nullsFirst: false }),
      supabase.from("invoices").select("*").eq("client", id).order("invoice_number", { ascending: false }),
      supabase.from("expenses").select("id,name,monthly_cost").eq("linked_client", id),
      supabase.from("client_documents").select("*").eq("client", id).order("created_at", { ascending: false }),
    ]);
    if (c.error) toast.error(c.error.message);
    setClient((c.data as unknown as ClientRow & { id: string }) ?? null);
    setStatusLog((s.data as unknown as StatusLog[]) ?? []);
    setContactLog((l.data as unknown as ContactLog[]) ?? []);
    setActions((a.data as unknown as Action[]) ?? []);
    setInvoices((i.data as unknown as Invoice[]) ?? []);
    setExpenses((e.data as unknown as Expense[]) ?? []);
    setDocuments((d.data as unknown as ClientDocument[]) ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const canEdit = canEditClient(role, client?.status);
  const canActions = canEditActions(role, client?.status);
  const admin = isAdminRole(role);

  const monthlyFee = client ? clientMonthlyFee(client) : 0;
  const clientCosts = useMemo(() => expenses.reduce((s, e) => s + Number(e.monthly_cost || 0), 0), [expenses]);
  const netMargin = monthlyFee - clientCosts;

  const outstanding = useMemo(() => invoices.filter((i) => i.status !== "Paid").reduce((s, i) => s + Number(i.total || 0), 0), [invoices]);
  const paidTotal = useMemo(() => invoices.filter((i) => i.status === "Paid").reduce((s, i) => s + Number(i.total || 0), 0), [invoices]);

  const statusTimeline = useMemo(() => {
    const entries = statusLog.map((s, idx) => {
      const next = statusLog[idx + 1];
      const end = next ? next.date : todayISO();
      return { ...s, days: daysBetween(s.date, end), current: !next };
    });
    return entries.reverse();
  }, [statusLog]);

  const currentStatusDuration = useMemo(() => {
    if (statusLog.length > 0) return durationLabel(statusTimeline[0]?.days ?? 0);
    if (client?.contract_start_date) return durationLabel(daysBetween(client.contract_start_date, todayISO()));
    return null;
  }, [statusLog, statusTimeline, client]);

  async function markPaid(inv: Invoice) {
    const { error } = await supabase.from("invoices").update({ status: "Paid" } as never).eq("id", inv.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Invoice #${inv.invoice_number ?? ""} marked paid`);
    load();
  }

  async function deleteClient() {
    if (!client) return;
    const ok = confirm(
      `Delete ${client.name}? This permanently deletes their Actions and Contact Log history. Invoices and expenses linked to this client will remain but become unlinked. This cannot be undone.`
    );
    if (!ok) return;
    const { error } = await supabase.from("clients").delete().eq("id", client.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`${client.name} deleted`);
    navigate({ to: "/clients" });
  }

  async function uploadDocument(files: FileList | null) {
    if (!files || files.length === 0 || !client) return;
    setUploading(true);
    let successCount = 0;
    for (const file of Array.from(files)) {
      const path = `${client.id}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("client-documents").upload(path, file);
      if (upErr) { toast.error(`Upload mislukt (${file.name}): ${upErr.message}`); continue; }
      const { error: dbErr } = await supabase.from("client_documents").insert({
        client: client.id,
        file_name: file.name,
        storage_path: path,
        file_size: file.size,
        content_type: file.type || null,
      });
      if (dbErr) {
        toast.error(`Opgeslagen bestand kon niet geregistreerd worden (${file.name}): ${dbErr.message}`);
        await supabase.storage.from("client-documents").remove([path]);
        continue;
      }
      successCount++;
    }
    setUploading(false);
    if (successCount > 0) toast.success(`${successCount} document(en) geüpload`);
    load();
  }

  async function downloadDocument(doc: ClientDocument) {
    const { data, error } = await supabase.storage.from("client-documents").createSignedUrl(doc.storage_path, 60);
    if (error || !data) { toast.error(error?.message ?? "Kon link niet aanmaken"); return; }
    window.open(data.signedUrl, "_blank");
  }

  async function saveDocumentEdit(docId: string, title: string, documentDate: string) {
    const { error } = await supabase
      .from("client_documents")
      .update({ title: title.trim() || null, document_date: documentDate || null })
      .eq("id", docId);
    if (error) { toast.error(error.message); return; }
    toast.success("Document bijgewerkt");
    setEditingDoc(null);
    load();
  }

  async function sendDocument(doc: ClientDocument) {
    if (!confirm(`Dit document naar ${client?.name} mailen?`)) return;
    setSendingDocId(doc.id);
    try {
      const res = await sendDocFn({ data: { documentId: doc.id } });
      toast.success(`Verstuurd naar ${res.sentTo}`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Versturen mislukt");
    } finally {
      setSendingDocId(null);
    }
  }

  async function deleteDocument(doc: ClientDocument) {
    if (!confirm(`"${doc.file_name}" verwijderen?`)) return;
    const { error: sErr } = await supabase.storage.from("client-documents").remove([doc.storage_path]);
    if (sErr) { toast.error(sErr.message); return; }
    const { error: dErr } = await supabase.from("client_documents").delete().eq("id", doc.id);
    if (dErr) { toast.error(dErr.message); return; }
    toast.success("Document verwijderd");
    load();
  }

  async function deleteInvoice(inv: Invoice) {
    if (!confirm(`Delete invoice #${inv.invoice_number ?? ""}?`)) return;
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

  const hasWebsite = !!(client.website_setup_fee || client.website_monthly_fee || client.website_yearly_fee);
  const hasSeo = client.seo_package && client.seo_package !== "None";

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto pb-12">
      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <Link to="/clients" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setLogOpen(true)} className="gap-1.5">
            <MessageSquare className="w-3.5 h-3.5" /> Log Contact
          </Button>
          {canEdit && (
            <Button size="sm" onClick={() => setEditOpen(true)} className="gap-1.5">
              <Pencil className="w-3.5 h-3.5" /> Edit
            </Button>
          )}
          {admin && (
            <Button size="sm" variant="outline" onClick={deleteClient} className="gap-1.5 text-destructive hover:bg-destructive/10">
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </Button>
          )}
        </div>
      </div>

      {/* Identity */}
      <div className="flex items-center gap-2 mb-1">
        <HealthDot health={client.health} />
        <h1 className="text-2xl font-bold">{client.name}</h1>
      </div>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <StatusBadge status={client.status} />
        {(client.status === "Prospect" || client.status === "Write-off") && <StageBadge stage={client.pipeline_stage} />}
        <span className="text-sm text-muted-foreground">{client.sector}</span>
      </div>

      {/* Contact card */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-2.5 mb-4">
        {client.contact_phone && (
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-sm"><Phone className="w-4 h-4 text-muted-foreground" /> {client.contact_phone}</span>
            <PhoneButtons phone={client.contact_phone} />
          </div>
        )}
        {client.contact_name && (
          <div className="flex items-center gap-2 text-sm">
            <span className="w-4 text-center text-muted-foreground">👤</span> {client.contact_name}
          </div>
        )}
        {client.contact_email && (
          <a href={`mailto:${client.contact_email}`} className="flex items-center gap-2 text-sm hover:underline">
            <Mail className="w-4 h-4 text-muted-foreground" /> {client.contact_email}
          </a>
        )}
        {client.location && (
          <div className="flex items-center gap-2 text-sm">
            <MapPin className="w-4 h-4 text-muted-foreground" /> {client.location}
          </div>
        )}
      </div>

      {/* Business details */}
      <div className="rounded-xl border border-border bg-card p-4 mb-4 space-y-5">
        {hasWebsite && (
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold mb-2">
              <Globe className="w-4 h-4 text-muted-foreground" /> Website
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Field k="Billing" v={client.website_billing_frequency} />
              <Field k="Setup Fee" v={client.website_setup_fee ? formatCurrency(client.website_setup_fee) : "—"} />
              <Field k="Monthly Fee" v={client.website_monthly_fee ? formatCurrency(client.website_monthly_fee) : "—"} />
              <Field k="Yearly Fee" v={client.website_yearly_fee ? formatCurrency(client.website_yearly_fee) : "—"} />
            </div>
          </div>
        )}

        {hasSeo && (
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold mb-2">
              <SearchIcon className="w-4 h-4 text-muted-foreground" /> SEO · {client.seo_package}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Field k="Billing" v={client.billing_frequency} />
              <Field k="Setup Fee" v={client.setup_fee ? formatCurrency(client.setup_fee) : "—"} />
              <Field k="Monthly Fee" v={client.monthly_fee ? formatCurrency(client.monthly_fee) : "—"} />
              <Field k="Yearly Fee" v={client.yearly_fee ? formatCurrency(client.yearly_fee) : "—"} />
              <Field k="SEO Start Date" v={client.seo_start_date ? formatDate(client.seo_start_date) : "—"} />
              <Field k="SEO End Date" v={client.seo_end_date ? formatDate(client.seo_end_date) : "—"} />
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-x-4 gap-y-2 text-sm border-t border-border pt-4">
          <Field k="Contract Start" v={client.contract_start_date ? formatDate(client.contract_start_date) : "—"} />
          <Field k="Renewal Date" v={client.renewal_date ? formatDate(client.renewal_date) : "—"} />
          <Field k="Next Follow-up" v={client.next_followup_date ? formatDate(client.next_followup_date) : "—"} />
        </div>

        {client.notes && (
          <div className="border-t border-border pt-4">
            <div className="flex items-center gap-2 text-sm font-semibold mb-1.5">
              <StickyNote className="w-4 h-4 text-muted-foreground" /> Notes
            </div>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{client.notes}</p>
          </div>
        )}

        {client.writeoff_reason && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            Write-off reason: {client.writeoff_reason}
          </div>
        )}
      </div>

      {/* Status history */}
      <div className="rounded-xl border border-border bg-card p-4 mb-4">
        <div className="flex items-center gap-2 text-sm font-semibold mb-2">
          <History className="w-4 h-4 text-muted-foreground" /> Status History
        </div>
        {statusTimeline.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No status changes recorded yet.
            {client.status && currentStatusDuration && <> Currently <span className="text-foreground font-medium">{client.status}</span> for {currentStatusDuration}.</>}
          </p>
        ) : (
          <div className="space-y-2">
            {statusTimeline.map((s) => (
              <div key={s.id} className="flex items-center gap-2 text-sm flex-wrap">
                <span className="text-xs text-muted-foreground w-20">{formatDate(s.date)}</span>
                {s.from_status && <><StatusBadge status={s.from_status} /><span className="text-muted-foreground">→</span></>}
                <StatusBadge status={s.to_status} />
                <span className="text-xs text-muted-foreground ml-auto">
                  {s.current ? `currently for ${durationLabel(s.days)}` : durationLabel(s.days)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Monthly cost & margin */}
      <div className="rounded-xl border border-border bg-card p-4 mb-6">
        <div className="flex items-center gap-2 text-sm font-semibold mb-3">
          <Wallet className="w-4 h-4 text-muted-foreground" /> Monthly Cost & Margin
        </div>
        <div className="space-y-2 text-sm">
          {expenses.map((e) => (
            <div key={e.id} className="flex justify-between">
              <span className="text-muted-foreground">{e.name}</span>
              <span>{formatCurrency(e.monthly_cost)}/mo</span>
            </div>
          ))}
          <div className="flex justify-between border-t border-border pt-2">
            <span className="text-muted-foreground">Client-specific costs</span>
            <span className="font-medium">{formatCurrency(clientCosts)}/month</span>
          </div>
          <div className="flex items-end justify-between border-t border-border pt-3">
            <div>
              <div className="text-muted-foreground">Net Margin</div>
              <div className="text-xs text-muted-foreground mt-0.5">{formatCurrency(monthlyFee)} fee − {formatCurrency(clientCosts)} costs</div>
            </div>
            <span className={`text-2xl font-bold ${netMargin < 0 ? "text-destructive" : ""}`}>{formatCurrency(netMargin)}<span className="text-sm font-normal text-muted-foreground">/mo</span></span>
          </div>
        </div>
      </div>

      {/* INVOICES */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Invoices</h2>
        {canActions && (
          <Button size="sm" variant="outline" onClick={() => { setEditingInvoice(null); setInvoiceOpen(true); }} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Add
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="rounded-xl border border-border bg-card p-3.5">
          <div className="text-sm text-muted-foreground">Outstanding</div>
          <div className="text-xl font-bold text-amber-400 mt-0.5">{formatCurrency(outstanding)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3.5">
          <div className="text-sm text-muted-foreground">Paid</div>
          <div className="text-xl font-bold text-green-400 mt-0.5">{formatCurrency(paidTotal)}</div>
        </div>
      </div>
      <div className="rounded-xl border border-border bg-card divide-y divide-border mb-6">
        {invoices.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground text-center">No invoices yet.</div>
        ) : invoices.map((inv) => {
          const firstItem = (inv.line_items as LineItem[] | null)?.[0];
          return (
            <div key={inv.id} className="p-4">
              <div className="font-semibold">#{inv.invoice_number ?? "—"}</div>
              <div className="text-sm text-muted-foreground mt-0.5">{formatDate(inv.date)}</div>
              {firstItem?.description && <div className="text-sm mt-0.5">{firstItem.description}</div>}
              <div className="font-semibold mt-1">{formatCurrency(Number(inv.total || 0))}</div>
              <span className={`inline-block mt-2 px-2 py-0.5 rounded-md text-xs font-medium ${
                inv.status === "Paid" ? "bg-green-500/15 text-green-400" : inv.status === "Sent" ? "bg-amber-500/15 text-amber-400" : "bg-muted text-muted-foreground"
              }`}>{inv.status}</span>
              <div className="flex justify-end items-center gap-1 mt-1">
                <Button size="icon" variant="ghost" title="Download PDF" onClick={() => pdfFor(inv)}>
                  <FileText className="w-4 h-4 text-muted-foreground" />
                </Button>
                {canActions && inv.status !== "Paid" && (
                  <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => markPaid(inv)}>Paid</Button>
                )}
                {canActions && (
                  <Button size="icon" variant="ghost" title="Edit" onClick={() => { setEditingInvoice(inv); setInvoiceOpen(true); }}>
                    <Pencil className="w-4 h-4 text-muted-foreground" />
                  </Button>
                )}
                {admin && (
                  <Button size="icon" variant="ghost" title="Delete" onClick={() => deleteInvoice(inv)}>
                    <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ACTIONS */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</h2>
        {canActions && (
          <Button size="sm" variant="outline" onClick={() => { setEditingAction(null); setActionOpen(true); }} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Add
          </Button>
        )}
      </div>
      <div className="rounded-xl border border-border bg-card divide-y divide-border mb-6">
        {actions.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground text-center">No actions yet.</div>
        ) : actions.map((a) => {
          const d = daysUntil(a.due_date);
          const overdue = d !== null && d < 0 && a.status !== "Completed" && a.waiting_period !== "Ongoing";
          return (
            <div key={a.id} className="p-4">
              <div className="font-medium">{a.action_description}</div>
              <div className="text-sm text-muted-foreground mt-0.5">
                {a.start_date && <>Start: {formatDate(a.start_date)}<br /></>}
                {a.waiting_period}
              </div>
              <div className="mt-1.5"><ActionStatusBadge status={a.status} /></div>
              {a.due_date && (
                <div className={`text-sm mt-1.5 ${overdue ? "text-destructive font-medium" : ""}`}>
                  {formatDate(a.due_date)}{overdue ? ` (${Math.abs(d!)}d overdue)` : ""}
                </div>
              )}
              <div className="text-sm text-muted-foreground mt-0.5">{a.result || "—"}</div>
              <div className="flex justify-end gap-1">
                {canActions && (
                  <Button size="icon" variant="ghost" onClick={() => { setEditingAction(a); setActionOpen(true); }}>
                    <Pencil className="w-4 h-4 text-muted-foreground" />
                  </Button>
                )}
                {admin && (
                  <Button size="icon" variant="ghost" onClick={() => deleteAction(a)}>
                    <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* CONTACT LOG */}
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Contact Log</h2>
      <div className="rounded-xl border border-border bg-card divide-y divide-border">
        {contactLog.length === 0 ? (
          <div className="p-8 text-center">
            <MessageSquare className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
            <p className="font-medium">No contact logged</p>
            <p className="text-sm text-muted-foreground mt-0.5">Log your outreach and responses here.</p>
          </div>
        ) : contactLog.map((c) => (
          <div key={c.id} className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <span>{CHANNEL_ICON[c.channel] ?? "📝"}</span>
              <span>{c.channel}</span>
              <span>·</span>
              <span>{c.direction}</span>
              <span className="ml-auto">{formatDate(c.date)}</span>
            </div>
            <p className="text-sm whitespace-pre-wrap">{c.note}</p>
          </div>
        ))}
      </div>

      {/* REPORTS & DOCUMENTS */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reports &amp; Documents</h2>
        <label className={`text-xs font-medium px-3 py-1.5 rounded-lg border border-border cursor-pointer hover:bg-accent ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
          {uploading ? "Uploading…" : "+ Upload"}
          <input
            type="file"
            multiple
            className="hidden"
            onChange={(e) => uploadDocument(e.target.files)}
            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.csv,.xlsx"
          />
        </label>
      </div>
      <div className="rounded-xl border border-border bg-card divide-y divide-border mb-6">
        {documents.length === 0 ? (
          <div className="p-8 text-center">
            <FileText className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
            <p className="font-medium">No documents yet</p>
            <p className="text-sm text-muted-foreground mt-0.5">Upload SEO reports, PDFs, or screenshots for this client.</p>
          </div>
        ) : documents.map((doc) => (
          <div key={doc.id} className="p-3.5">
            <div className="flex items-center gap-3">
              <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <button onClick={() => downloadDocument(doc)} className="text-sm font-medium truncate hover:underline text-left block">
                  {doc.title || doc.file_name}
                </button>
                <div className="text-xs text-muted-foreground">
                  {doc.document_date ? formatDate(doc.document_date) : formatDate(doc.created_at)}
                  {doc.file_size ? ` · ${(doc.file_size / 1024).toFixed(0)} KB` : ""}
                  {doc.last_sent_at ? ` · Sent to ${doc.last_sent_to} on ${formatDate(doc.last_sent_at)}` : ""}
                </div>
              </div>
              <Button
                size="sm" variant="outline" className="h-8 gap-1 text-xs shrink-0"
                disabled={sendingDocId === doc.id}
                onClick={() => sendDocument(doc)}
              >
                <Mail className="w-3.5 h-3.5" /> {sendingDocId === doc.id ? "..." : "Send"}
              </Button>
              <Button size="icon" variant="ghost" className="shrink-0" onClick={() => setEditingDoc(doc)}>
                <Pencil className="w-4 h-4 text-muted-foreground" />
              </Button>
              {admin && (
                <Button size="icon" variant="ghost" className="shrink-0" onClick={() => deleteDocument(doc)}>
                  <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                </Button>
              )}
            </div>
            {editingDoc?.id === doc.id && (
              <DocumentEditRow doc={doc} onCancel={() => setEditingDoc(null)} onSave={saveDocumentEdit} />
            )}
          </div>
        ))}
      </div>


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

function Field({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{k}</div>
      <div className="mt-0.5">{v || "—"}</div>
    </div>
  );
}

function DocumentEditRow({
  doc,
  onCancel,
  onSave,
}: {
  doc: { id: string; title: string | null; file_name: string; document_date: string | null };
  onCancel: () => void;
  onSave: (id: string, title: string, date: string) => void;
}) {
  const [title, setTitle] = useState(doc.title ?? doc.file_name);
  const [date, setDate] = useState(doc.document_date ?? "");
  return (
    <div className="mt-3 pl-0 sm:pl-7 flex flex-col gap-2">
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titel" className="text-sm w-full" />
      <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="text-sm w-full" />
      <div className="flex gap-2">
        <Button size="sm" onClick={() => onSave(doc.id, title, date)}>Save</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
