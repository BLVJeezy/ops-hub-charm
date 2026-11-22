import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, ChevronDown, ExternalLink, GitCompare, ListPlus, Pencil, Rocket, RotateCcw, SkipForward, Undo2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AREA_LABEL, PILES, STATUS, actionsFor, consentLine, pileOf, type Idea, type Pile } from "@/lib/growth-ideas";

export const Route = createFileRoute("/_authenticated/ideeen")({ component: IdeasPage });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
type Site = { id: string; name: string; url: string; repo: string | null; client_id: string | null };
const card = "rounded-2xl border border-border bg-card";
const btn = "h-11 px-4 rounded-full text-sm font-medium inline-flex items-center justify-center gap-2 disabled:opacity-40";
const TONE: Record<string, string> = {
  new: "bg-primary/15 text-primary",
  wait: "bg-muted text-foreground",
  work: "bg-sky-500/15 text-sky-300",
  check: "bg-amber-400/15 text-amber-300",
  ok: "bg-emerald-500/15 text-emerald-300",
  off: "bg-muted text-muted-foreground",
  bad: "bg-red-500/15 text-red-300",
};
const ACCENT: Record<Pile, string> = {
  nieuw: "before:bg-primary",
  controle: "before:bg-amber-400",
  bezig: "before:bg-sky-400",
  gebruikt: "before:bg-emerald-500",
  afgekeurd: "before:bg-muted-foreground/40",
};
const IMPACT: Record<string, string> = { hoog: "Grote impact", middel: "Middel", laag: "Klein" };
const ago = (iso: string | null) => {
  if (!iso) return "";
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  return m < 1 ? "net" : m < 60 ? `${m} min geleden` : m < 1440 ? `${Math.round(m / 60)} u geleden` : `${Math.round(m / 1440)} d geleden`;
};
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleString("nl-BE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
/** The approved prompt without the consent line in front of it. */
const body = (approved: string | null) => (approved ?? "").replace(/^Toestemming:.*\n\n/, "");

function IdeasPage() {
  const { user } = useAuth();
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [sites, setSites] = useState<Map<string, Site>>(new Map());
  const [pile, setPile] = useState<Pile | null>(null);
  const load = useCallback(async () => {
    const [i, s] = await Promise.all([
      db.from("growth_ideas").select("*").gte("created_at", new Date(Date.now() - 60 * 864e5).toISOString()).order("created_at", { ascending: false }).limit(300),
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

  const byPile = useMemo(() => {
    const m: Record<Pile, Idea[]> = { nieuw: [], controle: [], bezig: [], gebruikt: [], afgekeurd: [] };
    for (const i of ideas ?? []) m[pileOf(i)].push(i);
    return m;
  }, [ideas]);
  const current: Pile = pile ?? (byPile.controle.length ? "controle" : "nieuw");

  if (!ideas) return <div className="p-6 text-muted-foreground">Laden…</div>;
  const me = (user?.user_metadata?.full_name as string | undefined) || user?.email || "Jason";
  const list = byPile[current];
  const empty: Record<Pile, string> = {
    nieuw: "Geen nieuwe ideeën. De volgende scan komt om 08:13 of 19:13.",
    controle: "Niets om na te kijken.",
    bezig: "Claude is met niets bezig.",
    gebruikt: "Nog niets live gezet of als taak gebruikt.",
    afgekeurd: "Nog niets afgekeurd.",
  };
  return (
    <div className="pb-10">
      <div className="px-4 md:px-6 pt-4 md:pt-6 max-w-6xl mx-auto">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Ideeën</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">Twee keer per dag stelt Claude per klantensite één verbetering voor. Jij past de prompt aan en tikt op Deploy. Claude bouwt het apart; pas na Bevestigen gaat het live, en je kan het altijd terugzetten.</p>
      </div>

      {/* piles: sticky on phone so you always see where you are */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur mt-4 border-b border-border">
        <div className="max-w-6xl mx-auto px-2 md:px-6 flex gap-1 overflow-x-auto [scrollbar-width:none]">
          {PILES.map((p) => {
            const n = byPile[p.id].length, on = p.id === current;
            return (
              <button key={p.id} onClick={() => setPile(p.id)} aria-pressed={on} className={`relative shrink-0 h-12 px-3 md:px-4 text-[15px] md:text-sm font-medium inline-flex items-center gap-2 ${on ? "text-foreground" : "text-muted-foreground"}`}>
                {p.label}
                <span className={`min-w-[22px] h-[22px] px-1.5 rounded-full text-xs grid place-items-center ${n && (p.id === "controle" || p.id === "nieuw") ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{n}</span>
                {on && <span className="absolute left-2 right-2 bottom-0 h-[3px] rounded-full bg-primary" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 md:px-6 pt-4">
        {list.length === 0 ? (
          <p className={`${card} px-4 py-6 text-muted-foreground`}>{empty[current]}</p>
        ) : (
          <div className={`grid gap-3 ${current === "nieuw" || current === "controle" ? "lg:grid-cols-2" : "md:grid-cols-2 xl:grid-cols-3"}`}>
            {list.map((i) => <IdeaCard key={i.id} i={i} site={i.site_id ? sites.get(i.site_id) : undefined} me={me} onChange={load} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function Chip({ i }: { i: Idea }) {
  const label = i.task_id ? "Gebruikt · als taak" : STATUS[i.status].label;
  const tone = i.task_id ? "ok" : STATUS[i.status].tone;
  return <span className={`shrink-0 text-xs font-medium rounded-full px-2.5 py-1 ${TONE[tone]}`}>{label}</span>;
}

async function setStatus(i: Idea, from: string, patch: Record<string, unknown>, msg: string, done: () => void) {
  const r = await db.from("growth_ideas").update(patch).eq("id", i.id).eq("status", from);
  if (r.error) return toast.error(r.error.message);
  toast.success(msg);
  done();
}

function IdeaCard({ i, site, me, onChange }: { i: Idea; site?: Site; me: string; onChange: () => void }) {
  const a = actionsFor(i);
  const pile = pileOf(i);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<null | "edit" | "revise">(null);
  const [prompt, setPrompt] = useState(i.status === "voorgesteld" ? i.prompt : body(i.approved_prompt) || i.prompt);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setPrompt(i.status === "voorgesteld" ? i.prompt : body(i.approved_prompt) || i.prompt), [i.status, i.prompt, i.approved_prompt]);
  const consent = consentLine(me, new Date(), { name: site?.name ?? "deze site", repo: site?.repo ?? null });
  const run = async (from: string, patch: Record<string, unknown>, msg: string) => {
    setBusy(true);
    await setStatus(i, from, patch, msg, () => { setMode(null); onChange(); });
    setBusy(false);
  };

  async function deploy() {
    if (prompt.trim().length < 20) return toast.error("De prompt is te kort.");
    const { data: u } = await supabase.auth.getUser();
    await run("voorgesteld", { status: "ingepland", approved_prompt: `${consent}\n\n${prompt.trim()}`, approved_at: new Date().toISOString(), approved_by: u.user?.id ?? null }, "Doorgestuurd. Claude begint binnen het uur.");
  }
  async function saveQueued() {
    if (prompt.trim().length < 20) return toast.error("De prompt is te kort.");
    await run("ingepland", { approved_prompt: `${consent}\n\n${prompt.trim()}` }, "Prompt aangepast");
  }
  async function revise() {
    if (feedback.trim().length < 5) return toast.error("Schrijf kort wat er anders moet.");
    await run("ter_controle", { status: "aanpassen", feedback: feedback.trim() }, "Doorgestuurd. Claude past het aan binnen het uur.");
  }
  async function toTask() {
    setBusy(true);
    const t = await db.from("client_tasks").insert({ title: `Idee: ${i.title}`.slice(0, 200), client_id: i.client_id, assignee: "me" }).select("id").single();
    setBusy(false);
    if (t.error) return toast.error(t.error.message);
    await run("voorgesteld", { status: "overgeslagen", task_id: t.data.id, finished_at: new Date().toISOString() }, "Als taak gezet");
  }

  const info: Partial<Record<string, string>> = {
    ingepland: `Goedgekeurd ${ago(i.approved_at)}. Claude begint bij de volgende ronde (elk uur, 8–22 u). Je kan de prompt nog aanpassen.`,
    bezig: `Claude bouwt sinds ${ago(i.started_at)}.`,
    aanpassen: `Claude past het aan op basis van je opmerking: "${i.feedback ?? ""}"`,
    live_zetten: "Je hebt bevestigd. Claude zet het live bij de volgende ronde.",
    terugzetten: "Claude zet de live site terug naar hoe hij was, bij de volgende ronde.",
    annuleren: "Je hebt het afgekeurd. Claude ruimt de preview op; de live site is nooit aangeraakt.",
    mislukt: i.error ?? "Het bouwen lukte niet.",
    live: `Gebruikt: live sinds ${day(i.finished_at)}.${i.error ? ` Let op: ${i.error}` : ""}`,
    teruggezet: `Teruggezet ${day(i.reverted_at ?? i.finished_at)}. De site is weer zoals voor dit idee.`,
    geannuleerd: "Afgekeurd na de preview. Niet live gezet.",
    overgeslagen: i.task_id ? "Gebruikt: als taak in je takenlijst gezet." : "Afgekeurd voor het bouwen.",
  };

  return (
    <article className={`${card} relative overflow-hidden p-4 md:p-5 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 ${ACCENT[pile]} ${pile === "afgekeurd" ? "opacity-80" : ""}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2 gap-y-0.5">
            <span className="font-semibold text-foreground/85">{site?.name ?? "Site"}</span>
            <span>{AREA_LABEL[i.area] ?? i.area}</span>
            <span className={i.impact === "hoog" ? "text-emerald-400" : ""}>{IMPACT[i.impact]}</span>
            {i.kind === "tip" && <span>Tip voor jou</span>}
            <span>{ago(i.created_at)}</span>
          </div>
          <h3 className="text-[17px] md:text-lg font-semibold mt-1 leading-snug">{i.title}</h3>
        </div>
        <Chip i={i} />
      </div>

      {(pile === "nieuw" || pile === "controle") && <p className="mt-2 text-[15px] leading-relaxed text-foreground/90">{i.why}</p>}
      {pile === "nieuw" && !!i.findings?.length && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {i.findings.slice(0, 6).map((f, k) => <li key={k} className="text-xs rounded-lg bg-muted px-2.5 py-1 max-w-full break-words">{f.label}{f.value ? `: ${f.value}` : ""}</li>)}
        </ul>
      )}
      {info[i.status] && pile !== "nieuw" && <p className={`mt-2 text-sm leading-relaxed ${i.status === "mislukt" ? "text-red-300" : "text-muted-foreground"}`}>{info[i.status]}</p>}
      {i.result_summary && (pile === "controle" || pile === "gebruikt") && <p className="mt-2 text-[15px] leading-relaxed whitespace-pre-wrap">{i.result_summary}</p>}
      {pile === "controle" && i.rounds > 0 && <p className="mt-1 text-xs text-muted-foreground">Aangepast na je opmerking ({i.rounds}×).</p>}

      {/* prompt: open to read and edit before Deploy, or while it waits in the queue */}
      {(a.deploy || a.editQueued) && (
        <div className="mt-3">
          {a.deploy ? (
            <button onClick={() => setOpen(!open)} className="text-sm text-muted-foreground inline-flex items-center gap-1 h-10">
              <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />{open ? "Prompt verbergen" : "Prompt bekijken en aanpassen"}
            </button>
          ) : null}
          {((a.deploy && open) || mode === "edit") && (
            <div className="mt-1 space-y-2">
              <p className="text-xs rounded-xl bg-primary/10 text-primary px-3 py-2 leading-relaxed">{consent}</p>
              <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={10} className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-base md:text-sm leading-relaxed" />
              {prompt !== i.prompt && <button onClick={() => setPrompt(i.prompt)} className="text-xs text-muted-foreground inline-flex items-center gap-1 h-8"><RotateCcw className="w-3 h-3" />Terug naar het voorstel</button>}
            </div>
          )}
        </div>
      )}

      {mode === "revise" && (
        <div className="mt-3 space-y-2">
          <textarea autoFocus value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={4} placeholder="Wat moet er anders? Bv. 'Knop in de huisstijlkleur en alleen op mobiel tonen.'" className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-base md:text-sm" />
          <p className="text-xs text-muted-foreground">Claude past het aan op dezelfde preview. De live site blijft onaangeroerd.</p>
        </div>
      )}

      {/* links to check the result */}
      {(i.preview_url || i.diff_url) && (pile === "controle" || pile === "gebruikt") && (
        <div className="mt-3 flex flex-wrap gap-2">
          {i.preview_url && pile === "controle" && <a href={i.preview_url} target="_blank" rel="noopener noreferrer" className={`${btn} border border-border`}><ExternalLink className="w-4 h-4" />Bekijk preview</a>}
          {i.diff_url && <a href={i.diff_url} target="_blank" rel="noopener noreferrer" className={`${btn} border border-border`}><GitCompare className="w-4 h-4" />Wat is er veranderd</a>}
          {pile === "gebruikt" && site?.url && !i.task_id && <a href={site.url} target="_blank" rel="noopener noreferrer" className={`${btn} border border-border`}><ExternalLink className="w-4 h-4" />Live site</a>}
        </div>
      )}

      {/* actions */}
      <div className="mt-3 flex flex-wrap gap-2">
        {a.deploy && <button disabled={busy || !site?.repo} onClick={() => void deploy()} className={`${btn} px-5 bg-primary text-primary-foreground font-semibold flex-1 sm:flex-none`}><Rocket className="w-4 h-4" />Deploy</button>}
        {a.task && <button disabled={busy} onClick={() => void toTask()} className={`${btn} bg-primary text-primary-foreground flex-1 sm:flex-none`}><ListPlus className="w-4 h-4" />Zet als taak</button>}
        {a.skip && <button disabled={busy} onClick={() => void run("voorgesteld", { status: "overgeslagen", finished_at: new Date().toISOString() }, "Afgekeurd")} className={`${btn} border border-border flex-1 sm:flex-none`}><SkipForward className="w-4 h-4" />Afkeuren</button>}

        {a.editQueued && mode !== "edit" && <button onClick={() => setMode("edit")} className={`${btn} border border-border`}><Pencil className="w-4 h-4" />Prompt aanpassen</button>}
        {a.editQueued && mode === "edit" && <button disabled={busy} onClick={() => void saveQueued()} className={`${btn} bg-primary text-primary-foreground`}><Check className="w-4 h-4" />Bewaren</button>}
        {a.unqueue && <button disabled={busy} onClick={() => void run("ingepland", { status: "voorgesteld", approved_prompt: null, approved_at: null }, "Teruggehaald naar Nieuw")} className={`${btn} text-muted-foreground`}><Undo2 className="w-4 h-4" />Toch niet</button>}

        {a.review && mode !== "revise" && (
          <>
            <button disabled={busy} onClick={() => { if (confirm(`Live zetten op ${site?.name ?? "de site"}? De wijziging komt dan op de echte website.`)) void run("ter_controle", { status: "live_zetten", decided_at: new Date().toISOString() }, "Bevestigd. Claude zet het live bij de volgende ronde."); }} className={`${btn} bg-emerald-500 text-black font-semibold flex-1 sm:flex-none`}><Check className="w-4 h-4" />Bevestigen</button>
            <button onClick={() => setMode("revise")} className={`${btn} border border-border flex-1 sm:flex-none`}><Pencil className="w-4 h-4" />Aanpassen</button>
            <button disabled={busy} onClick={() => void run("ter_controle", { status: "annuleren", decided_at: new Date().toISOString() }, "Afgekeurd. De live site blijft zoals hij was.")} className={`${btn} border border-border text-red-300 flex-1 sm:flex-none`}><X className="w-4 h-4" />Afkeuren</button>
          </>
        )}
        {a.revise && mode === "revise" && (
          <>
            <button disabled={busy} onClick={() => void revise()} className={`${btn} bg-primary text-primary-foreground`}>Opnieuw laten bouwen</button>
            <button onClick={() => setMode(null)} className={`${btn} text-muted-foreground`}>Terug</button>
          </>
        )}
        {mode === "edit" && <button onClick={() => { setMode(null); setPrompt(body(i.approved_prompt)); }} className={`${btn} text-muted-foreground`}>Annuleren</button>}

        {a.rollback && <button disabled={busy} onClick={() => { if (confirm(`"${i.title}" terugzetten? Claude haalt de wijziging weer van ${site?.name ?? "de site"}.`)) void run("live", { status: "terugzetten", decided_at: new Date().toISOString() }, "Claude zet het terug bij de volgende ronde."); }} className={`${btn} border border-border`}><Undo2 className="w-4 h-4" />Terugzetten</button>}
        {a.retry && <button disabled={busy} onClick={() => void run("mislukt", { status: "ingepland", error: null }, "Opnieuw ingepland")} className={`${btn} border border-border`}><RotateCcw className="w-4 h-4" />Opnieuw proberen</button>}
        {a.retry && <button disabled={busy} onClick={() => void run("mislukt", { status: "overgeslagen", finished_at: new Date().toISOString() }, "Afgekeurd")} className={`${btn} text-muted-foreground`}>Afkeuren</button>}
        {a.reopen && <button disabled={busy} onClick={() => void run(i.status, { status: "voorgesteld", approved_prompt: null, approved_at: null, finished_at: null, decided_at: null, branch: null, preview_url: null, diff_url: null }, "Terug bij Nieuw")} className={`${btn} border border-border`}><RotateCcw className="w-4 h-4" />Opnieuw voorstellen</button>}
      </div>
      {a.deploy && !site?.repo && <p className="mt-2 text-xs text-amber-400">Deze site heeft geen gekoppelde GitHub-repo, dus Claude kan dit niet bouwen. Zet het als taak of koppel de repo bij Status.</p>}
    </article>
  );
}
