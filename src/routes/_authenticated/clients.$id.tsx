import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { ArrowLeft, Pencil, Phone, Mail, MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge, StageBadge } from "@/components/StatusBadge";
import { HealthDot } from "@/components/HealthDot";
import { PhoneButtons } from "@/components/PhoneButtons";
import { ClientModal, type ClientRow } from "@/components/ClientModal";
import { ContactLogModal } from "@/components/ContactLogModal";
import { formatCurrency, formatDate } from "@/lib/format";
import { computeMRR } from "@/lib/fees";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/clients/$id")({
  component: ClientDetail,
});

type StatusLog = { id: string; from_status: string | null; to_status: string; date: string; created_at: string };
type ContactLog = { id: string; date: string; channel: string; direction: string; note: string; created_at: string };

function ClientDetail() {
  const { id } = Route.useParams();
  const [client, setClient] = useState<(ClientRow & { id: string }) | null>(null);
  const [statusLog, setStatusLog] = useState<StatusLog[]>([]);
  const [contactLog, setContactLog] = useState<ContactLog[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [c, s, l] = await Promise.all([
      supabase.from("clients").select("*").eq("id", id).maybeSingle(),
      supabase.from("client_status_log").select("*").eq("client", id).order("created_at", { ascending: false }),
      supabase.from("contact_log").select("*").eq("client", id).order("date", { ascending: false }),
    ]);
    if (c.error) toast.error(c.error.message);
    setClient((c.data as unknown as ClientRow & { id: string }) ?? null);
    setStatusLog((s.data as unknown as StatusLog[]) ?? []);
    setContactLog((l.data as unknown as ContactLog[]) ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }
  if (!client) {
    return (
      <div className="p-6">
        <Link to="/clients" className="text-sm text-muted-foreground">← Back</Link>
        <p className="mt-4">Client not found.</p>
      </div>
    );
  }

  const mrr = computeMRR(client);

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
              <StageBadge stage={client.pipeline_stage} />
              <span className="text-xs text-muted-foreground">{client.sector}</span>
              {client.location && <span className="text-xs text-muted-foreground">· {client.location}</span>}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setLogOpen(true)} className="gap-2">
            <MessageSquarePlus className="w-4 h-4" /> Log contact
          </Button>
          <Button onClick={() => setEditOpen(true)} className="gap-2">
            <Pencil className="w-4 h-4" /> Edit
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Stat label="MRR" value={formatCurrency(mrr)} />
        <Stat label="Setup fee" value={client.setup_fee ? formatCurrency(client.setup_fee) : "—"} />
        <Stat label="Renewal" value={formatDate(client.renewal_date)} />
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="contact">Contact log ({contactLog.length})</TabsTrigger>
          <TabsTrigger value="status">Status history ({statusLog.length})</TabsTrigger>
        </TabsList>

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

            {client.notes && (
              <Panel title="Notes" className="md:col-span-2">
                <p className="text-sm whitespace-pre-wrap">{client.notes}</p>
              </Panel>
            )}
          </div>
        </TabsContent>

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

        <TabsContent value="status" className="mt-4">
          <div className="rounded-xl border border-border bg-card divide-y divide-border">
            {statusLog.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground text-center">No status changes yet.</div>
            ) : statusLog.map((s) => (
              <div key={s.id} className="p-4 flex items-center gap-3 text-sm">
                <span className="text-xs text-muted-foreground w-24">{formatDate(s.date)}</span>
                {s.from_status && <><StatusBadge status={s.from_status} /><span className="text-muted-foreground">→</span></>}
                <StatusBadge status={s.to_status} />
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <ClientModal open={editOpen} onOpenChange={setEditOpen} initial={client} onSaved={() => load()} />
      <ContactLogModal clientId={id} open={logOpen} onOpenChange={setLogOpen} onSaved={() => load()} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
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
