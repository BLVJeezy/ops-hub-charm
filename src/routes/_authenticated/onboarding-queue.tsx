import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ClipboardList, CheckCircle2, XCircle, Phone, Mail, MapPin, Building2, Lock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState } from "@/components/EmptyState";
import { formatDate } from "@/lib/format";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/onboarding-queue")({
  component: OnboardingQueueGate,
});

function OnboardingQueueGate() {
  const { role, loading } = useAuth();
  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (role !== "admin") {
    return (
      <div className="p-6 max-w-lg mx-auto">
        <div className="rounded-xl border border-border bg-card">
          <EmptyState icon={Lock} title="Admin only" description="Only administrators can review onboarding submissions." />
        </div>
      </div>
    );
  }
  return <OnboardingQueue />;
}

type Submission = {
  id: string;
  business_name: string;
  sector: string;
  location: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string | null;
  billing_address: string | null;
  vat_number: string | null;
  website_needed: string[] | null;
  services_interested: string[] | null;
  keyword_1: string | null;
  keyword_2: string | null;
  keyword_3: string | null;
  target_audience: string | null;
  notes: string | null;
  submitted_at: string;
  review_status: string;
  linked_client_id: string | null;
};

type Tab = "Pending" | "Approved" | "Rejected";

function OnboardingQueue() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("Pending");
  const [items, setItems] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Submission | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const { data, error } = await supabase
      .from("onboarding_submissions" as never)
      .select("*")
      .order("submitted_at", { ascending: false });
    if (error) toast.error(error.message);
    setItems((data as Submission[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel("onboarding-queue")
      .on("postgres_changes", { event: "*", schema: "public", table: "onboarding_submissions" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const filtered = items.filter((s) => s.review_status === tab);
  const pendingCount = items.filter((s) => s.review_status === "Pending").length;

  async function approve(s: Submission) {
    setBusyId(s.id);
    // Combine keywords into notes so we don't lose them
    const keywords = [s.keyword_1, s.keyword_2, s.keyword_3].filter(Boolean).join(", ");
    const combinedNotes = [
      s.notes,
      keywords ? `Zoekwoorden: ${keywords}` : null,
      s.target_audience ? `Doelgroep: ${s.target_audience}` : null,
      s.services_interested?.length ? `Interesse: ${s.services_interested.join(", ")}` : null,
      s.website_needed?.length ? `Website situatie: ${s.website_needed.join(", ")}` : null,
    ].filter(Boolean).join("\n\n");

    const websiteNeeded = (s.website_needed || []).some((w) => /geen website|vernieuwd/i.test(w));

    const { data: client, error: cErr } = await supabase
      .from("clients" as never)
      .insert({
        name: s.business_name,
        sector: s.sector,
        location: s.location,
        contact_name: s.contact_name,
        contact_phone: s.contact_phone,
        contact_email: s.contact_email,
        billing_address: s.billing_address,
        vat_number: s.vat_number,
        status: "Prospect",
        pipeline_stage: "Interested",
        website_needed: websiteNeeded,
        notes: combinedNotes || null,
      } as never)
      .select("id")
      .single();

    if (cErr || !client) {
      setBusyId(null);
      toast.error(cErr?.message || "Kon klant niet aanmaken");
      return;
    }

    const { error: uErr } = await supabase
      .from("onboarding_submissions" as never)
      .update({ review_status: "Approved", linked_client_id: (client as { id: string }).id } as never)
      .eq("id", s.id);

    setBusyId(null);
    if (uErr) { toast.error(uErr.message); return; }
    toast.success("Klant aangemaakt");
    setSelected(null);
    navigate({ to: "/clients/$id", params: { id: (client as { id: string }).id } });
  }

  async function reject(s: Submission) {
    setBusyId(s.id);
    const { error } = await supabase
      .from("onboarding_submissions" as never)
      .update({ review_status: "Rejected" } as never)
      .eq("id", s.id);
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Aanvraag afgewezen");
    setSelected(null);
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Onboarding Queue</h1>
        {pendingCount > 0 && (
          <span className="text-xs px-2 py-1 rounded-full bg-primary/20 text-primary font-medium">
            {pendingCount} pending
          </span>
        )}
      </div>

      <div className="flex gap-1 mb-4 border-b border-border">
        {(["Pending", "Approved", "Rejected"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm border-b-2 -mb-px transition ${
              tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t} {t === "Pending" && pendingCount > 0 && <span className="ml-1 text-xs">({pendingCount})</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card">
          <EmptyState icon={ClipboardList} title={`No ${tab.toLowerCase()} submissions`}
            description={tab === "Pending" ? "New public sign-ups appear here." : ""} />
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {filtered.map((s) => (
            <li key={s.id}>
              <button
                onClick={() => setSelected(s)}
                className="w-full text-left rounded-xl border border-border bg-card p-4 hover:bg-accent/40 transition"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{s.business_name}</div>
                    <div className="text-xs text-muted-foreground truncate">{s.sector} · {s.location}</div>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(s.submitted_at)}</span>
                </div>
                <div className="text-sm truncate">{s.contact_name}</div>
                <div className="text-xs text-muted-foreground truncate">{s.contact_phone}</div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 p-0 md:p-4"
          onClick={() => setSelected(null)}>
          <div
            className="w-full md:max-w-2xl max-h-[90vh] overflow-y-auto rounded-t-2xl md:rounded-2xl bg-card border border-border"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-border flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold truncate">{selected.business_name}</h2>
                <p className="text-xs text-muted-foreground">Ingediend {formatDate(selected.submitted_at)}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>

            <div className="p-5 space-y-4 text-sm">
              <Section title="Bedrijf">
                <Row icon={Building2} label="Sector">{selected.sector}</Row>
                <Row icon={MapPin} label="Stad">{selected.location}</Row>
                {selected.billing_address && <Row label="Adres">{selected.billing_address}</Row>}
                {selected.vat_number && <Row label="BTW">{selected.vat_number}</Row>}
              </Section>

              <Section title="Contact">
                <Row label="Naam">{selected.contact_name}</Row>
                <Row icon={Phone} label="Telefoon">
                  <a className="hover:underline" href={`tel:${selected.contact_phone}`}>{selected.contact_phone}</a>
                </Row>
                {selected.contact_email && (
                  <Row icon={Mail} label="Email">
                    <a className="hover:underline" href={`mailto:${selected.contact_email}`}>{selected.contact_email}</a>
                  </Row>
                )}
              </Section>

              {selected.website_needed?.length ? (
                <Section title="Website situatie">
                  <ul className="list-disc list-inside space-y-0.5">{selected.website_needed.map((w) => <li key={w}>{w}</li>)}</ul>
                </Section>
              ) : null}

              {selected.services_interested?.length ? (
                <Section title="Interesse">
                  <ul className="list-disc list-inside space-y-0.5">{selected.services_interested.map((w) => <li key={w}>{w}</li>)}</ul>
                </Section>
              ) : null}

              {(selected.keyword_1 || selected.keyword_2 || selected.keyword_3) && (
                <Section title="Zoekwoorden">
                  <div className="flex flex-wrap gap-2">
                    {[selected.keyword_1, selected.keyword_2, selected.keyword_3].filter(Boolean).map((k) => (
                      <span key={k!} className="px-2 py-1 rounded bg-muted text-xs">{k}</span>
                    ))}
                  </div>
                </Section>
              )}

              {selected.target_audience && <Section title="Doelgroep"><p className="whitespace-pre-wrap">{selected.target_audience}</p></Section>}
              {selected.notes && <Section title="Notities"><p className="whitespace-pre-wrap">{selected.notes}</p></Section>}
            </div>

            {selected.review_status === "Pending" && (
              <div className="p-5 border-t border-border flex flex-col-reverse md:flex-row gap-2 md:justify-end">
                <button
                  onClick={() => reject(selected)}
                  disabled={busyId === selected.id}
                  className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-md border border-border text-sm hover:bg-accent disabled:opacity-50"
                >
                  <XCircle className="w-4 h-4" /> Reject
                </button>
                <button
                  onClick={() => approve(selected)}
                  disabled={busyId === selected.id}
                  className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" /> {busyId === selected.id ? "Bezig…" : "Approve → Create client"}
                </button>
              </div>
            )}
            {selected.review_status !== "Pending" && (
              <div className="p-5 border-t border-border text-xs text-muted-foreground">
                Status: <span className="text-foreground">{selected.review_status}</span>
                {selected.linked_client_id && (
                  <>
                    {" · "}
                    <button
                      className="text-primary hover:underline"
                      onClick={() => navigate({ to: "/clients/$id", params: { id: selected.linked_client_id! } })}
                    >
                      View client →
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{title}</h3>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ icon: Icon, label, children }: { icon?: typeof Phone; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      {Icon && <Icon className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />}
      <div className="min-w-0">
        <span className="text-muted-foreground">{label}: </span>
        <span>{children}</span>
      </div>
    </div>
  );
}
