import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, ChevronDown, ExternalLink, GitCompare, ListPlus, Rocket, RotateCcw, SkipForward, Undo2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AREA_LABEL, STATUS, actionsFor, consentLine, isOpen, type Idea } from "@/lib/growth-ideas";

export const Route = createFileRoute("/_authenticated/ideeen")({ component: IdeasPage });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
type Site = { id: string; name: string; url: string; repo: string | null; client_id: string | null };
const card = "rounded-2xl border border-border bg-card";
const TONE: Record<string, string> = {
  new: "bg-primary/15 text-primary",
  wait: "bg-muted text-foreground",
  work: "bg-sky-500/15 text-sky-300",
  check: "bg-amber-400/15 text-amber-300",
  ok: "bg-emerald-500/15 text-emerald-300",
  off: "bg-muted text-muted-foreground",
  bad: "bg-red-500/15 text-red-300",
};
const IMPACT: Record<string, string> = { hoog: "Grote impact", middel: "Middel", laag: "Klein" };
const ago = (iso: string | null) => {
  if (!iso) return "";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 60 ? `${m} min geleden` : m < 1440 ? `${Math.round(m / 60)} u geleden` : `${Math.round(m / 1440)} d geleden`;
};

function IdeasPage() {
  const { user } = useAuth();
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [sites, setSites] = useState<Map<string, Site>>(new Map());
  const load = useCallback(async () => {
    const [i, s] = await Promise.all([
      db.from("growth_ideas").select("*").gte("created_at", new Date(Date.now() - 45 * 864e5).toISOString()).order("created_at", { ascending: false }).limit(200),
      db.from("monitored_sites").select("id, name, url, repo, client_id"),
    ]);
    if (i.error) toast.error(i.error.message);
    setIdeas(i.data ?? []);
    setSites(new Map((s.data ?? []).map((x: Site) => [x.id, x])));
  }, []);
  useEffect(() => {
    void load();
    const ch = supabase.channel("ideas-page").on("postgres_changes", { event: "*", schema: "public", table: "growth_ideas" }, () => void load()).subscribe();
    return () => void supabase.removeChannel(ch);
  }, [load]);

  const groups = useMemo(() => {
    const all = ideas ?? [];
    return {
      review: all.filter((i) => i.status === "ter_controle"),
      fresh: all.filter((i) => i.status === "voorgesteld" && !i.task_id),
      busy: all.filter((i) => ["ingepland", "bezig", "live_zetten", "annuleren", "mislukt"].includes(i.status)),
      done: all.filter((i) => !isOpen(i.status) || i.task_id).slice(0, 30),
    };
  }, [ideas]);

  if (!ideas) return <div className="p-6 text-muted-foreground">Laden…</div>;
  const name = (user?.user_metadata?.full_name as string | undefined) || user?.email || "Jason";
  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Ideeën</h1>
        <p className="text-sm text-muted-foreground mt-1">Elke ochtend en avond scant Claude elke klantensite en stelt per site één verbetering voor. Jij past de prompt aan en tikt op Deploy. Claude bouwt het apart; pas na jouw bevestiging gaat het live.</p>
      </div>

      {groups.review.length > 0 && (
        <Section title="Na te kijken" count={groups.review.length}>
          {groups.review.map((i) => <ReviewCard key={i.id} i={i} site={i.site_id ? sites.get(i.site_id) : undefined} onChange={load} />)}
        </Section>
      )}

      <Section title="Nieuwe ideeën" count={groups.fresh.length} empty="Geen nieuwe ideeën. De volgende scan komt vanzelf.">
        {groups.fresh.map((i) => <IdeaCard key={i.id} i={i} site={i.site_id ? sites.get(i.site_id) : undefined} me={name} onChange={load} />)}
      </Section>

      {groups.busy.length > 0 && (
        <Section title="Bezig" count={groups.busy.length}>
          {groups.busy.map((i) => <BusyCard key={i.id} i={i} site={i.site_id ? sites.get(i.site_id) : undefined} onChange={load} />)}
        </Section>
      )}

      {groups.done.length > 0 && (
        <details className={`${card} px-4 py-3`}>
          <summary className="cursor-pointer text-sm font-medium py-1">Geschiedenis ({groups.done.length})</summary>
          <ul className="mt-2 divide-y divide-border text-sm">
            {groups.done.map((i) => (
              <li key={i.id} className="py-2.5 flex items-center gap-3">
                <span className="flex-1 min-w-0"><span className="block truncate">{i.title}</span><span className="text-xs text-muted-foreground">{i.site_id ? sites.get(i.site_id)?.name : ""} · {ago(i.finished_at ?? i.updated_at)}</span></span>
                <Chip status={i.task_id && i.status === "overgeslagen" ? "Als taak gezet" : undefined} s={i.status} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Section({ title, count, empty, children }: { title: string; count: number; empty?: string; children?: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-medium text-muted-foreground mb-2">{title}{count ? ` (${count})` : ""}</h2>
      {count ? <div className="space-y-3">{children}</div> : <p className={`${card} px-4 py-5 text-muted-foreground`}>{empty}</p>}
    </section>
  );
}

function Chip({ s, status }: { s: Idea["status"]; status?: string }) {
  const st = STATUS[s];
  return <span className={`shrink-0 text-xs rounded-full px-2.5 py-1 ${TONE[status ? "off" : st.tone]}`}>{status ?? st.label}</span>;
}

function Head({ i, site }: { i: Idea; site?: Site }) {
  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2">
          <span className="font-medium text-foreground/80">{site?.name ?? "Site"}</span>
          <span>{AREA_LABEL[i.area] ?? i.area}</span>
          <span className={i.impact === "hoog" ? "text-emerald-400" : ""}>{IMPACT[i.impact]}</span>
        </div>
        <h3 className="text-base sm:text-lg font-semibold mt-0.5 leading-snug">{i.title}</h3>
      </div>
      <Chip s={i.status} />
    </div>
  );
}

function IdeaCard({ i, site, me, onChange }: { i: Idea; site?: Site; me: string; onChange: () => void }) {
  const [prompt, setPrompt] = useState(i.prompt);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const a = actionsFor(i);
  const canBuild = a.deploy && !!site?.repo;
  const consent = consentLine(me, new Date(), { name: site?.name ?? "deze site", repo: site?.repo ?? null });
  async function run(patch: Record<string, unknown>, msg: string) {
    setBusy(true);
    const r = await db.from("growth_ideas").update(patch).eq("id", i.id).eq("status", "voorgesteld");
    setBusy(false);
    if (r.error) return toast.error(r.error.message);
    toast.success(msg);
    onChange();
  }
  async function deploy() {
    if (prompt.trim().length < 20) return toast.error("De prompt is te kort.");
    const { data: u } = await supabase.auth.getUser();
    await run({ status: "ingepland", approved_prompt: `${consent}\n\n${prompt.trim()}`, approved_at: new Date().toISOString(), approved_by: u.user?.id ?? null }, "Doorgestuurd. Claude begint binnen het uur.");
  }
  async function toTask() {
    setBusy(true);
    const t = await db.from("client_tasks").insert({ title: `Idee: ${i.title}`.slice(0, 200), client_id: i.client_id, assignee: "me" }).select("id").single();
    setBusy(false);
    if (t.error) return toast.error(t.error.message);
    await run({ status: "overgeslagen", task_id: t.data.id, finished_at: new Date().toISOString() }, "Als taak gezet");
  }
  return (
    <article className={`${card} p-4`}>
      <Head i={i} site={site} />
      <p className="mt-2 text-[15px] leading-relaxed text-foreground/90">{i.why}</p>
      {!!i.findings?.length && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {i.findings.slice(0, 6).map((f, k) => <li key={k} className="text-xs rounded-full bg-muted px-2.5 py-1">{f.label}{f.value ? `: ${f.value}` : ""}</li>)}
        </ul>
      )}
      {a.deploy && (
        <div className="mt-3">
          <button onClick={() => setOpen(!open)} className="text-sm text-muted-foreground inline-flex items-center gap-1 h-9">
            <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />{open ? "Prompt verbergen" : "Prompt bekijken en aanpassen"}
          </button>
          {open && (
            <div className="mt-1 space-y-2">
              <p className="text-xs rounded-xl bg-primary/10 text-primary px-3 py-2">{consent}</p>
              <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={8} className="w-full rounded-xl border border-input bg-background px-3 py-2 text-base sm:text-sm leading-relaxed" />
              {prompt !== i.prompt && <button onClick={() => setPrompt(i.prompt)} className="text-xs text-muted-foreground inline-flex items-center gap-1"><RotateCcw className="w-3 h-3" />Terug naar het voorstel</button>}
            </div>
          )}
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {a.deploy && (
          <button disabled={busy || !canBuild} onClick={() => void deploy()} className="h-11 px-5 rounded-full bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-40">
            <Rocket className="w-4 h-4" />Deploy
          </button>
        )}
        {a.task && <button disabled={busy} onClick={() => void toTask()} className="h-11 px-4 rounded-full bg-primary text-primary-foreground text-sm font-medium inline-flex items-center gap-2"><ListPlus className="w-4 h-4" />Zet als taak</button>}
        {a.skip && <button disabled={busy} onClick={() => void run({ status: "overgeslagen", finished_at: new Date().toISOString() }, "Overgeslagen")} className="h-11 px-4 rounded-full border border-border text-sm inline-flex items-center gap-2"><SkipForward className="w-4 h-4" />Overslaan</button>}
      </div>
      {a.deploy && !site?.repo && <p className="mt-2 text-xs text-amber-400">Deze site heeft geen gekoppelde GitHub-repo, dus Claude kan dit niet bouwen. Zet het als taak of koppel de repo bij Status.</p>}
    </article>
  );
}

function BusyCard({ i, site, onChange }: { i: Idea; site?: Site; onChange: () => void }) {
  const a = actionsFor(i);
  async function set(patch: Record<string, unknown>, from: string, msg: string) {
    const r = await db.from("growth_ideas").update(patch).eq("id", i.id).eq("status", from);
    if (r.error) return toast.error(r.error.message);
    toast.success(msg);
    onChange();
  }
  const text: Record<string, string> = {
    ingepland: `Goedgekeurd ${ago(i.approved_at)}. Claude pakt het op bij de volgende ronde (elk uur).`,
    bezig: `Claude is ermee bezig sinds ${ago(i.started_at)}.`,
    live_zetten: "Je hebt bevestigd. Claude zet het live bij de volgende ronde.",
    annuleren: "Je hebt geannuleerd. Claude ruimt de preview op bij de volgende ronde.",
    mislukt: i.error ?? "Het bouwen lukte niet.",
  };
  return (
    <article className={`${card} p-4`}>
      <Head i={i} site={site} />
      <p className={`mt-2 text-sm ${i.status === "mislukt" ? "text-red-300" : "text-muted-foreground"}`}>{text[i.status]}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {a.unqueue && <button onClick={() => void set({ status: "voorgesteld", approved_prompt: null, approved_at: null }, "ingepland", "Teruggehaald")} className="h-10 px-4 rounded-full border border-border text-sm inline-flex items-center gap-2"><Undo2 className="w-4 h-4" />Toch niet</button>}
        {a.retry && <button onClick={() => void set({ status: "ingepland", error: null }, "mislukt", "Opnieuw ingepland")} className="h-10 px-4 rounded-full border border-border text-sm inline-flex items-center gap-2"><RotateCcw className="w-4 h-4" />Opnieuw proberen</button>}
        {a.retry && <button onClick={() => void set({ status: "overgeslagen", finished_at: new Date().toISOString() }, "mislukt", "Opgeborgen")} className="h-10 px-4 rounded-full text-sm text-muted-foreground">Opbergen</button>}
      </div>
    </article>
  );
}

function ReviewCard({ i, site, onChange }: { i: Idea; site?: Site; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  async function decide(status: "live_zetten" | "annuleren") {
    if (status === "live_zetten" && !confirm(`Live zetten op ${site?.name ?? "de site"}? De wijziging komt dan op de echte website.`)) return;
    setBusy(true);
    const r = await db.from("growth_ideas").update({ status, decided_at: new Date().toISOString() }).eq("id", i.id).eq("status", "ter_controle");
    setBusy(false);
    if (r.error) return toast.error(r.error.message);
    toast.success(status === "live_zetten" ? "Bevestigd. Claude zet het live bij de volgende ronde." : "Geannuleerd. De live site blijft zoals hij was.");
    onChange();
  }
  return (
    <article className={`${card} p-4 border-amber-400/40`}>
      <Head i={i} site={site} />
      {i.result_summary && <p className="mt-2 text-[15px] leading-relaxed whitespace-pre-wrap">{i.result_summary}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {i.preview_url && <a href={i.preview_url} target="_blank" rel="noopener noreferrer" className="h-11 px-4 rounded-full border border-border text-sm inline-flex items-center gap-2"><ExternalLink className="w-4 h-4" />Bekijk preview</a>}
        {i.diff_url && <a href={i.diff_url} target="_blank" rel="noopener noreferrer" className="h-11 px-4 rounded-full border border-border text-sm inline-flex items-center gap-2"><GitCompare className="w-4 h-4" />Wat is er veranderd</a>}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button disabled={busy} onClick={() => void decide("live_zetten")} className="h-12 rounded-full bg-emerald-500 text-black text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"><Check className="w-4 h-4" />Bevestigen</button>
        <button disabled={busy} onClick={() => void decide("annuleren")} className="h-12 rounded-full border border-border text-sm font-medium inline-flex items-center justify-center gap-2 disabled:opacity-50"><X className="w-4 h-4" />Annuleren</button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Klaar {ago(i.review_at)}. Pas na Bevestigen komt het op de echte website.</p>
    </article>
  );
}
