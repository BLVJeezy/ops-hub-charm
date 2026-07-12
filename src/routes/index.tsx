import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SolynLogo } from "@/components/SolynLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowRight, Check, MapPin, Phone, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Website laten maken & Google Bedrijfsprofiel — Solyn Global | Limburg" },
      { name: "description", content: "Website laten maken in Limburg? Solyn Global bouwt websites en optimaliseert je Google Bedrijfsprofiel voor vakmensen in Hasselt, Genk, Tongeren en Bilzen. Eerst resultaat, dan pas een contract." },
    ],
  }),
  component: LandingPage,
});

const GOLD = "#C9A24B";

function LandingPage() {
  return (
    <div className="min-h-screen bg-[#121418] text-[#F5F5F3]" style={{ fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      {/* NAV */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#121418]/90 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <SolynLogo size={36} />
            <span className="font-semibold tracking-wide">Solyn Global</span>
          </div>
          <div className="flex items-center gap-3">
            <a href="#resultaten" className="hidden text-sm text-white/70 hover:text-white sm:block">Resultaten</a>
            <a href="#werkwijze" className="hidden text-sm text-white/70 hover:text-white sm:block">Werkwijze</a>
            <Link to="/auth" className="hidden text-sm text-white/50 hover:text-white sm:block">Login</Link>
            <a href="#demo">
              <Button size="sm" className="bg-[#C9A24B] font-semibold text-[#14181F] hover:bg-[#E4C888]">
                Gratis demo
              </Button>
            </a>
          </div>
        </nav>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden px-5 pb-20 pt-16 sm:pt-24">
        <div
          className="pointer-events-none absolute left-1/2 top-[-200px] h-[560px] w-[820px] -translate-x-1/2 rounded-full opacity-30 blur-3xl"
          style={{ background: `radial-gradient(circle, ${GOLD}, transparent 65%)` }}
        />
        <div className="relative mx-auto max-w-3xl text-center">
          <p className="mb-5 text-xs font-bold uppercase tracking-[0.25em] text-[#E4C888]">
            Websites · Lokale SEO · Google Bedrijfsprofiel
          </p>
          <h1 className="text-4xl font-bold leading-tight sm:text-5xl md:text-6xl">
            Een website laten maken is makkelijk.
            <br />
            <span className="italic text-[#E4C888]" style={{ fontFamily: "Georgia, serif" }}>
              Gevonden worden
            </span>{" "}
            is het echte werk.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-white/65">
            Ik bouw websites en optimaliseer Google Bedrijfsprofielen voor vakmensen in
            Limburg — loodgieters, elektriciens, HVAC en meer. Geen jaarcontract vooraf.
            Eerst laten zien dat het werkt.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <a href="#demo">
              <Button size="lg" className="bg-[#C9A24B] px-7 font-bold text-[#14181F] hover:bg-[#E4C888]">
                Vraag een gratis demo aan <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </a>
            <a href="#resultaten">
              <Button size="lg" variant="outline" className="border-white/20 bg-transparent text-white hover:border-[#C9A24B] hover:bg-[#C9A24B]/10">
                Bekijk echte cijfers
              </Button>
            </a>
          </div>
          <p className="mt-5 text-xs text-white/40">
            Geen verkooppraatje. Je krijgt een eerlijke analyse van waar je nu staat — ook als het antwoord is dat je ons niet nodig hebt.
          </p>
        </div>
      </section>

      {/* RESULTATEN — echte Riory data */}
      <section id="resultaten" className="border-t border-white/10 bg-[#1B222C] px-5 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-[#E4C888]">Echte resultaten, geen beloftes</p>
            <h2 className="text-3xl font-bold sm:text-4xl">Wat één maand werk deed voor een loodgieter uit Bilzen</h2>
            <p className="mx-auto mt-4 max-w-2xl text-white/60">
              Riory BV kwam bij ons zonder lokale zichtbaarheid. Dit zijn de gemeten cijfers na de
              eerste maand — gemeten over 169 punten in heel Zuid-Limburg, niet vanaf één gunstig adres.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              value="14 van 15"
              label="zoekwoorden verbeterd in maand één"
              sub="het 15e stond al op #1 en bleef daar"
            />
            <StatCard
              value="69%"
              label='top-3 zichtbaarheid op "wc verstopt Tongeren"'
              sub="gestegen van 45% bij de start"
            />
            <StatCard
              value="26 leads"
              label="gemeten in juni — eerste volledige maand"
              sub="van 0 meetbare leads vóór de samenwerking"
            />
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-[#232B36] p-6">
              <div className="mb-3 flex items-center gap-2 text-[#E4C888]">
                <TrendingUp className="h-4 w-4" />
                <span className="text-sm font-semibold">Nieuwe stad, directe impact</span>
              </div>
              <p className="text-sm leading-relaxed text-white/65">
                Toen we Riemst toevoegden aan het servicegebied stond Riory daar bij de eerste meting
                meteen op <strong className="text-white">positie #1</strong> voor "ontstoppingsdienst
                Riemst" en "wc verstopt Riemst". Dat is geen toeval — dat is hoe een goed opgebouwd
                profiel doorwerkt naar nieuwe gebieden.
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-[#232B36] p-6">
              <div className="mb-3 flex items-center gap-2 text-[#E4C888]">
                <Check className="h-4 w-4" />
                <span className="text-sm font-semibold">Eerlijk over wat nog niet lukt</span>
              </div>
              <p className="text-sm leading-relaxed text-white/65">
                In Hasselt zitten twee sterke lokale spelers stevig op #1 en #2. Dat lossen we niet op in
                één maand, en dat zeggen we ook gewoon. Je krijgt van ons elke maand een rapport met wat
                verbeterde, wat niet, en wat we eraan doen.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* WERKWIJZE */}
      <section id="werkwijze" className="px-5 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-[#E4C888]">Werkwijze</p>
            <h2 className="text-3xl font-bold sm:text-4xl">Eerst bewijzen, dan pas afspreken</h2>
          </div>
          <div className="grid gap-8 sm:grid-cols-3">
            <Step n="1" title="Gratis demo & analyse">
              We bekijken je huidige website en Google Bedrijfsprofiel en laten je zien waar je nu
              klanten misloopt — met concrete cijfers, niet met vage beloftes.
            </Step>
            <Step n="2" title="Pilotperiode">
              We gaan aan de slag zonder dat je een langlopend contract tekent. Je ziet elke maand in
              een rapport precies wat er verandert.
            </Step>
            <Step n="3" title="Doorgaan als het werkt">
              Zie je resultaat? Dan zetten we door met een vast maandbedrag. Zie je het niet? Dan stop
              je gewoon, zonder gedoe.
            </Step>
          </div>
          <div className="mx-auto mt-12 max-w-2xl rounded-xl border border-[#C9A24B]/40 bg-[#C9A24B]/5 p-6 text-center">
            <p className="text-sm leading-relaxed text-white/70">
              <strong className="text-white">Waarom zo?</strong> Omdat de meeste bureaus je een
              jaarcontract laten tekenen vóór ze iets bewezen hebben. Wij draaien dat om. Als het werk
              goed is, blijf je vanzelf.
            </p>
          </div>
        </div>
      </section>

      {/* VOOR WIE */}
      <section className="border-t border-white/10 bg-[#1B222C] px-5 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mb-10 text-center">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-[#E4C888]">Voor wie</p>
            <h2 className="text-3xl font-bold sm:text-4xl">Vakmensen die gebeld willen worden</h2>
            <p className="mx-auto mt-4 max-w-xl text-white/60">
              Wij werken voor lokale bedrijven in Hasselt, Genk, Tongeren, Bilzen, Sint-Truiden en
              omstreken — mensen die geen tijd hebben voor marketingjargon.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2.5">
            {["Loodgieters", "Elektriciens", "HVAC & verwarming", "Bouw & renovatie", "Schoonmaakbedrijven", "Kapsalons", "Autodetailing", "Medische groothandel"].map((s) => (
              <span key={s} className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/70">
                {s}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* DEMO FORM */}
      <section id="demo" className="px-5 py-20">
        <div className="mx-auto max-w-xl">
          <div className="mb-8 text-center">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-[#E4C888]">Gratis demo</p>
            <h2 className="text-3xl font-bold sm:text-4xl">Benieuwd waar jij nu staat?</h2>
            <p className="mt-4 text-white/60">
              Vul dit in en je krijgt binnen één werkdag een eerlijke inschatting van je huidige
              zichtbaarheid — gratis, zonder verplichtingen.
            </p>
          </div>
          <DemoForm />
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/10 bg-[#1B222C] px-5 py-12">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-6 text-center sm:flex-row sm:justify-between sm:text-left">
          <div className="flex items-center gap-3">
            <SolynLogo size={32} />
            <div>
              <div className="text-sm font-semibold">Solyn Global</div>
              <div className="text-xs text-white/45">Websites & lokale zichtbaarheid voor vakmensen in Limburg</div>
            </div>
          </div>
          <div className="space-y-1 text-xs text-white/50">
            <div className="flex items-center justify-center gap-1.5 sm:justify-end">
              <Phone className="h-3 w-3" />
              <a href="tel:+32485594555" className="hover:text-white">+32 485 59 45 55</a>
            </div>
            <div className="flex items-center justify-center gap-1.5 sm:justify-end">
              <MapPin className="h-3 w-3" />
              <span>Zuid-Limburg, België</span>
            </div>
            <div>© 2026 Solyn Global · BE 0840.931.404</div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function StatCard({ value, label, sub }: { value: string; label: string; sub: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#232B36] p-6 text-center">
      <div className="text-4xl font-extrabold text-[#E4C888]" style={{ fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      <div className="mt-2 text-sm font-medium text-white">{label}</div>
      <div className="mt-1 text-xs text-white/45">{sub}</div>
    </div>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#C9A24B] text-lg font-bold text-[#E4C888]">
          {n}
        </div>
        <div className="h-px flex-1 bg-white/10" />
      </div>
      <h3 className="mb-2 text-lg font-semibold">{title}</h3>
      <p className="text-sm leading-relaxed text-white/60">{children}</p>
    </div>
  );
}

function DemoForm() {
  const [form, setForm] = useState({ business_name: "", contact_name: "", contact_phone: "", contact_email: "", location: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.business_name.trim() || !form.contact_name.trim() || !form.contact_phone.trim()) {
      toast.error("Vul minstens bedrijfsnaam, naam en telefoonnummer in");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("onboarding_submissions").insert({
      business_name: form.business_name,
      contact_name: form.contact_name,
      contact_phone: form.contact_phone,
      contact_email: form.contact_email || null,
      location: form.location || "",
      sector: "Other",
      notes: "Gratis demo-aanvraag via homepage",
    });
    setBusy(false);
    if (error) {
      toast.error("Versturen mislukt — bel of app ons gerust rechtstreeks");
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="rounded-xl border border-[#C9A24B]/50 bg-[#C9A24B]/10 p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#C9A24B]">
          <Check className="h-6 w-6 text-[#14181F]" />
        </div>
        <h3 className="text-xl font-bold">Aanvraag ontvangen!</h3>
        <p className="mt-2 text-sm text-white/65">
          Bedankt — we nemen binnen één werkdag contact met je op met een eerlijke analyse.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-white/10 bg-[#232B36] p-6 sm:p-8">
      <div>
        <Label className="text-white/80">Bedrijfsnaam *</Label>
        <Input value={form.business_name} onChange={(e) => set("business_name", e.target.value)} placeholder="bv. Sanitair Jansen" className="mt-1.5 border-white/15 bg-[#161D26] text-white placeholder:text-white/30" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label className="text-white/80">Je naam *</Label>
          <Input value={form.contact_name} onChange={(e) => set("contact_name", e.target.value)} className="mt-1.5 border-white/15 bg-[#161D26] text-white" />
        </div>
        <div>
          <Label className="text-white/80">Telefoon *</Label>
          <Input value={form.contact_phone} onChange={(e) => set("contact_phone", e.target.value)} placeholder="+32..." className="mt-1.5 border-white/15 bg-[#161D26] text-white placeholder:text-white/30" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label className="text-white/80">E-mail</Label>
          <Input type="email" value={form.contact_email} onChange={(e) => set("contact_email", e.target.value)} className="mt-1.5 border-white/15 bg-[#161D26] text-white" />
        </div>
        <div>
          <Label className="text-white/80">Stad</Label>
          <Input value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="bv. Genk" className="mt-1.5 border-white/15 bg-[#161D26] text-white placeholder:text-white/30" />
        </div>
      </div>
      <Button type="submit" disabled={busy} className="w-full bg-[#C9A24B] py-6 text-base font-bold text-[#14181F] hover:bg-[#E4C888]">
        {busy ? "Versturen…" : "Vraag mijn gratis demo aan"}
      </Button>
      <p className="text-center text-xs text-white/40">
        Liever direct contact? Bel of app <a href="tel:+32485594555" className="text-[#E4C888] hover:underline">+32 485 59 45 55</a>
      </p>
    </form>
  );
}
