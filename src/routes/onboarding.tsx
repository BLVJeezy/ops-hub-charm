import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SolynLogo } from "@/components/SolynLogo";
import { CLIENT_SECTORS } from "@/lib/constants";

export const Route = createFileRoute("/onboarding")({
  ssr: false,
  component: OnboardingForm,
});

const WEBSITE_OPTIONS = [
  "Ik heb nog geen website",
  "Ik heb een website, maar die moet vernieuwd worden",
  "Ik heb al een goede website",
  "Ik weet het niet zeker",
];
const SERVICES_OPTIONS = [
  "Nieuwe website",
  "Lokale SEO (beter vindbaar in Google)",
  "Google Bedrijfsprofiel optimalisatie",
  "Ik weet het nog niet, advies graag",
];

function OnboardingForm() {
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    business_name: "", sector: "Other", location: "",
    contact_name: "", contact_phone: "", contact_email: "",
    billing_address: "", vat_number: "",
    website_needed: [] as string[], services_interested: [] as string[],
    keyword_1: "", keyword_2: "", keyword_3: "",
    target_audience: "", notes: "",
  });

  function toggle(field: "website_needed" | "services_interested", val: string) {
    setForm((f) => ({
      ...f,
      [field]: f[field].includes(val) ? f[field].filter((v) => v !== val) : [...f[field], val],
    }));
  }
  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.from("onboarding_submissions").insert({
      ...form,
      sector: form.sector as (typeof CLIENT_SECTORS)[number],
    });
    setBusy(false);
    if (error) { toast.error("Kon aanvraag niet versturen"); return; }
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <SolynLogo size={64} />
          <CheckCircle2 className="w-16 h-16 mx-auto mt-6 text-[#22C55E]" />
          <h1 className="mt-4 text-2xl font-bold">Bedankt!</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We hebben je aanvraag ontvangen en nemen zo snel mogelijk contact op.
          </p>
        </div>
      </div>
    );
  }

  const Input = (p: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...p} className={`w-full h-10 px-3 rounded-md bg-card border border-input text-sm ${p.className || ""}`} />
  );
  const Textarea = (p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
    <textarea {...p} className={`w-full px-3 py-2 rounded-md bg-card border border-input text-sm ${p.className || ""}`} rows={3} />
  );
  const Label = ({ children }: { children: React.ReactNode }) => (
    <label className="text-sm font-medium block mb-1">{children}</label>
  );
  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-primary">{title}</h2>
      {children}
    </section>
  );

  return (
    <div className="min-h-screen bg-background py-10 px-4">
      <div className="max-w-xl mx-auto">
        <div className="flex flex-col items-center mb-8">
          <SolynLogo size={48} />
          <h1 className="mt-4 text-xl font-semibold">Nieuwe klant aanmelding</h1>
          <p className="text-xs text-muted-foreground mt-1">Vertel ons over je bedrijf</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-8">
          <Section title="Bedrijfsgegevens">
            <div><Label>Bedrijfsnaam *</Label><Input required value={form.business_name} onChange={(e) => set("business_name", e.target.value)} /></div>
            <div>
              <Label>Sector *</Label>
              <select required value={form.sector} onChange={(e) => set("sector", e.target.value)}
                className="w-full h-10 px-3 rounded-md bg-card border border-input text-sm">
                {CLIENT_SECTORS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div><Label>Stad *</Label><Input required value={form.location} onChange={(e) => set("location", e.target.value)} /></div>
          </Section>

          <Section title="Contactpersoon">
            <div><Label>Naam *</Label><Input required value={form.contact_name} onChange={(e) => set("contact_name", e.target.value)} /></div>
            <div><Label>Telefoon *</Label><Input required type="tel" placeholder="+32 …" value={form.contact_phone} onChange={(e) => set("contact_phone", e.target.value)} /></div>
            <div><Label>E-mail</Label><Input type="email" value={form.contact_email} onChange={(e) => set("contact_email", e.target.value)} /></div>
            <div><Label>Facturatieadres</Label><Input value={form.billing_address} onChange={(e) => set("billing_address", e.target.value)} /></div>
            <div><Label>BTW-nummer</Label><Input placeholder="BE 0000.000.000" value={form.vat_number} onChange={(e) => set("vat_number", e.target.value)} /></div>
          </Section>

          <Section title="Website situatie">
            {WEBSITE_OPTIONS.map((opt) => (
              <label key={opt} className="flex items-start gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.website_needed.includes(opt)} onChange={() => toggle("website_needed", opt)}
                  className="mt-0.5 accent-[#C9A14A]" />
                <span>{opt}</span>
              </label>
            ))}
          </Section>

          <Section title="Waarin zijn we geïnteresseerd?">
            {SERVICES_OPTIONS.map((opt) => (
              <label key={opt} className="flex items-start gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.services_interested.includes(opt)} onChange={() => toggle("services_interested", opt)}
                  className="mt-0.5 accent-[#C9A14A]" />
                <span>{opt}</span>
              </label>
            ))}
          </Section>

          <Section title="Zoekwoorden">
            <div><Label>Zoekwoord 1</Label><Input value={form.keyword_1} onChange={(e) => set("keyword_1", e.target.value)} /></div>
            <div><Label>Zoekwoord 2</Label><Input value={form.keyword_2} onChange={(e) => set("keyword_2", e.target.value)} /></div>
            <div><Label>Zoekwoord 3</Label><Input value={form.keyword_3} onChange={(e) => set("keyword_3", e.target.value)} /></div>
          </Section>

          <Section title="Extra informatie">
            <div><Label>Doelgroep</Label><Textarea value={form.target_audience} onChange={(e) => set("target_audience", e.target.value)} /></div>
            <div><Label>Notities</Label><Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} /></div>
          </Section>

          <button type="submit" disabled={busy}
            className="w-full h-12 rounded-md bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
            {busy ? "Bezig…" : "Verstuur aanvraag"}
          </button>
        </form>
      </div>
    </div>
  );
}
