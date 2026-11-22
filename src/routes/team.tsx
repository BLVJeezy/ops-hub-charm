import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Check, ExternalLink, FileText, FolderOpen, Github, Globe, LogOut, RotateCcw, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { SolynLogo } from "@/components/SolynLogo";
import { myClient, myDocLink, myPortal, myRequestReady, myTaskDone } from "@/lib/team.functions";
import { KINDS, PRIORITY_LABEL, STATUS_LABEL, type Status } from "@/lib/client-requests";
import { accessLabel } from "@/lib/team";

export const Route = createFileRoute("/team")({
  ssr: false,
  head: () => ({ meta: [{ title: "Team · Solyn Global" }, { name: "robots", content: "noindex" }] }),
  component: TeamPortal,
});

type Portal = Awaited<ReturnType<typeof myPortal>>;
type ClientView = Awaited<ReturnType<typeof myClient>>;

const kindLabel = (k: string) => KINDS.find((x) => x.id === k)?.label ?? k;
const dayLabel = (d: string | null) => (d ? new Date(d + "T12:00:00").toLocaleDateString("nl-BE", { weekday: "short", day: "numeric", month: "short" }) : "Geen datum");
const ago = (iso: string | null) => {
  if (!iso) return "nog niet";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 60 ? `${m} min geleden` : m < 1440 ? `${Math.round(m / 60)} u geleden` : `${Math.round(m / 1440)} d geleden`;
};
const errText = (e: unknown) => (e instanceof Error ? e.message : "Er ging iets mis.");
const card = "rounded-2xl border border-border bg-card";

function TeamPortal() {
  const { user, loading } = useAuth();
  const [stage, setStage] = useState<"check" | "password" | "ready">("check");
  const [linkError, setLinkError] = useState("");

  // One-time link from the invite mail: log in with it, then choose a password.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const th = q.get("th"), t = q.get("t");
    if (!th) return setStage("ready");
    supabase.auth.verifyOtp({ token_hash: th, type: t === "magiclink" ? "magiclink" : "invite" }).then(({ error }) => {
      window.history.replaceState(null, "", "/team");
      if (error) {
        setLinkError("Deze link werkt niet meer (al gebruikt of verlopen). Log in met je wachtwoord, of vraag Jason om een nieuwe link.");
        setStage("ready");
      } else setStage("password");
    });
  }, []);

  if (loading || stage === "check") return <Shell><p className="text-muted-foreground">Even laden…</p></Shell>;
  if (stage === "password" && user) return <Shell><ChoosePassword onDone={() => setStage("ready")} /></Shell>;
  if (!user) return <Shell><Login notice={linkError} /></Shell>;
  return <Portal />;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <SolynLogo size={48} />
          <h1 className="mt-4 text-xl font-semibold">Solyn Global · Team</h1>
        </div>
        {children}
      </div>
    </div>
  );
}

function Login({ notice }: { notice?: string }) {
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) toast.error("E-mail of wachtwoord klopt niet.");
  }
  return (
    <form onSubmit={submit} className={`${card} p-5 space-y-4`}>
      {notice && <p role="alert" className="text-sm text-amber-400">{notice}</p>}
      <label className="block text-sm">E-mail
        <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1.5 w-full h-12 rounded-xl border border-input bg-background px-4 text-base" />
      </label>
      <label className="block text-sm">Wachtwoord
        <input type="password" autoComplete="current-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1.5 w-full h-12 rounded-xl border border-input bg-background px-4 text-base" />
      </label>
      <button disabled={busy} className="w-full h-12 rounded-full bg-primary text-primary-foreground font-medium disabled:opacity-50">{busy ? "Inloggen…" : "Inloggen"}</button>
      <p className="text-xs text-muted-foreground text-center">Wachtwoord vergeten? Vraag Jason om een nieuwe inloglink.</p>
    </form>
  );
}

function ChoosePassword({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState(""), [pw2, setPw2] = useState(""), [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw !== pw2) return toast.error("De twee wachtwoorden zijn niet gelijk.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Wachtwoord bewaard.");
    onDone();
  }
  return (
    <form onSubmit={submit} className={`${card} p-5 space-y-4`}>
      <div>
        <h2 className="text-lg font-semibold">Kies je wachtwoord</h2>
        <p className="text-sm text-muted-foreground mt-1">Minstens 10 tekens. Hiermee log je voortaan in.</p>
      </div>
      <input type="password" autoComplete="new-password" required minLength={10} placeholder="Wachtwoord" value={pw} onChange={(e) => setPw(e.target.value)} className="w-full h-12 rounded-xl border border-input bg-background px-4 text-base" />
      <input type="password" autoComplete="new-password" required minLength={10} placeholder="Nog eens" value={pw2} onChange={(e) => setPw2(e.target.value)} className="w-full h-12 rounded-xl border border-input bg-background px-4 text-base" />
      <button disabled={busy} className="w-full h-12 rounded-full bg-primary text-primary-foreground font-medium disabled:opacity-50">{busy ? "Bewaren…" : "Bewaren en verder"}</button>
    </form>
  );
}

function Portal() {
  const { role, signOut } = useAuth();
  const load = useServerFn(myPortal);
  const [data, setData] = useState<Portal | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"werk" | "klanten">("werk");
  const [open, setOpen] = useState<string | null>(null);
  const refresh = useCallback(() => load().then(setData).catch((e) => setError(errText(e))), [load]);
  useEffect(() => { void refresh(); }, [refresh]);

  if (error)
    return (
      <Shell>
        <div className={`${card} p-5 space-y-4`}>
          <p>{error}</p>
          {(role === "admin" || role === "ops" || role === "sales") && <a href="/dashboard" className="block text-center h-12 leading-[3rem] rounded-full bg-primary text-primary-foreground font-medium">Naar de Hub</a>}
          <button onClick={() => void signOut()} className="w-full h-11 rounded-full border border-border text-sm">Uitloggen</button>
        </div>
      </Shell>
    );
  if (!data) return <Shell><p className="text-muted-foreground text-center">Je overzicht laden…</p></Shell>;
  if (open) return <ClientProfile id={open} onBack={() => setOpen(null)} portal={data} onChange={refresh} />;

  const openTasks = data.tasks.filter((t) => !t.done_at), doneTasks = data.tasks.filter((t) => t.done_at);
  const openReqs = data.requests.filter((r) => r.status !== "klaar");
  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b border-border">
        <div className="max-w-3xl mx-auto px-4 pt-4 pb-0">
          <div className="flex items-center gap-3">
            <SolynLogo size={32} />
            <div className="min-w-0 flex-1">
              <div className="font-semibold truncate">Hoi {data.me.name.split(" ")[0]}</div>
              <div className="text-xs text-muted-foreground truncate">{[data.me.title, accessLabel({ active: true, access_until: data.me.access_until }, data.today)].filter(Boolean).join(" · ")}</div>
            </div>
            <button aria-label="Uitloggen" onClick={() => void signOut()} className="w-11 h-11 rounded-full grid place-items-center text-muted-foreground hover:text-foreground"><LogOut className="w-5 h-5" /></button>
          </div>
          <nav className="flex gap-1 mt-3">
            {([["werk", `Mijn werk${openTasks.length + openReqs.length ? ` (${openTasks.length + openReqs.length})` : ""}`], ["klanten", "Klanten"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} aria-current={tab === k ? "page" : undefined} className={`relative h-12 px-4 text-base font-medium ${tab === k ? "text-primary" : "text-muted-foreground"}`}>
                {l}{tab === k && <span className="absolute left-3 right-3 bottom-0 h-[3px] rounded-full bg-primary" />}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 pt-5 space-y-6">
        {tab === "werk" ? (
          <>
            <Section title="Aanvragen van klanten" empty="Geen open aanvragen op jouw naam." count={openReqs.length}>
              {openReqs.map((r) => <RequestRow key={r.id} r={r} onChange={refresh} onClient={setOpen} />)}
            </Section>
            <Section title="Taken" empty="Geen open taken. Goed bezig." count={openTasks.length}>
              {openTasks.map((t) => <TaskRow key={t.id} t={t} today={data.today} onChange={refresh} onClient={setOpen} />)}
            </Section>
            {doneTasks.length > 0 && (
              <Section title="Afgewerkt (laatste 7 dagen)" count={doneTasks.length}>
                {doneTasks.map((t) => <TaskRow key={t.id} t={t} today={data.today} onChange={refresh} onClient={setOpen} />)}
              </Section>
            )}
          </>
        ) : (
          <Section title="Klanten" empty="Je hebt nog geen klanten toegewezen gekregen." count={data.clients.length}>
            {data.clients.map((c) => (
              <button key={c.id} onClick={() => setOpen(c.id)} className="w-full flex items-center gap-3 px-4 py-4 text-left hover:bg-muted/30">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: c.brand_color || "hsl(var(--primary))" }} />
                <span className="flex-1 min-w-0">
                  <span className="block font-medium truncate">{c.name}</span>
                  <span className="block text-sm text-muted-foreground truncate">{[c.sector, c.location].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="text-muted-foreground">›</span>
              </button>
            ))}
          </Section>
        )}
      </main>
    </div>
  );
}

function Section({ title, empty, count, children }: { title: string; empty?: string; count: number; children?: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-medium text-muted-foreground mb-2">{title}</h2>
      {count ? <div className={`${card} divide-y divide-border overflow-hidden`}>{children}</div> : <p className={`${card} px-4 py-5 text-muted-foreground`}>{empty}</p>}
    </section>
  );
}

function TaskRow({ t, today, onChange, onClient }: { t: Portal["tasks"][number]; today: string; onChange: () => void; onClient: (id: string) => void }) {
  const done = useServerFn(myTaskDone);
  const [busy, setBusy] = useState(false);
  const late = !t.done_at && t.due_date && t.due_date < today;
  async function toggle() {
    setBusy(true);
    try { await done({ data: { id: t.id, done: !t.done_at } }); onChange(); } catch (e) { toast.error(errText(e)); } finally { setBusy(false); }
  }
  return (
    <div className="flex items-start gap-3 px-4 py-3.5">
      <button disabled={busy} onClick={() => void toggle()} aria-label={t.done_at ? "Terug openzetten" : "Afvinken"} className={`mt-0.5 w-8 h-8 shrink-0 rounded-full border-2 grid place-items-center ${t.done_at ? "bg-emerald-500 border-emerald-500 text-black" : "border-muted-foreground/50"}`}>
        {t.done_at && <Check className="w-4 h-4" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className={`text-base ${t.done_at ? "line-through text-muted-foreground" : ""}`}>{t.title}</div>
        <div className="text-sm text-muted-foreground mt-0.5 flex flex-wrap gap-x-2">
          {t.client && t.client_id && <button onClick={() => onClient(t.client_id!)} className="underline underline-offset-2">{t.client}</button>}
          <span className={late ? "text-amber-400" : ""}>{late ? "Te laat · " : ""}{dayLabel(t.due_date)}</span>
        </div>
      </div>
    </div>
  );
}

function RequestRow({ r, onChange, onClient }: { r: Portal["requests"][number]; onChange: () => void; onClient: (id: string) => void }) {
  const ready = useServerFn(myRequestReady);
  const [openForm, setOpenForm] = useState(false), [note, setNote] = useState(""), [busy, setBusy] = useState(false);
  async function send() {
    setBusy(true);
    try { await ready({ data: { id: r.id, note } }); toast.success("Doorgestuurd naar Jason om na te kijken."); setOpenForm(false); onChange(); } catch (e) { toast.error(errText(e)); } finally { setBusy(false); }
  }
  return (
    <div className="px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-base font-medium">{r.title}</div>
          <div className="text-sm text-muted-foreground mt-0.5 flex flex-wrap gap-x-2">
            {r.client && r.client_id && <button onClick={() => onClient(r.client_id!)} className="underline underline-offset-2">{r.client}</button>}
            <span>{kindLabel(r.kind)}</span>
            {r.priority === 1 && <span className="text-amber-400">{PRIORITY_LABEL[1]}</span>}
            {r.wished_date && <span>gewenst {dayLabel(r.wished_date)}</span>}
          </div>
        </div>
        <span className="shrink-0 text-xs rounded-full px-2.5 py-1 bg-muted">{r.review_ready_at ? "Bij Jason" : STATUS_LABEL[r.status as Status] ?? r.status}</span>
      </div>
      {r.details && <p className="mt-2 text-sm whitespace-pre-wrap text-foreground/85 bg-muted/30 rounded-xl px-3 py-2">{r.details}</p>}
      {!r.review_ready_at && !openForm && (
        <button onClick={() => setOpenForm(true)} className="mt-3 h-11 px-4 rounded-full border border-border text-sm font-medium inline-flex items-center gap-2"><Send className="w-4 h-4" />Klaar voor controle</button>
      )}
      {openForm && (
        <div className="mt-3 space-y-2">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} placeholder="Wat heb je gedaan? (optioneel)" className="w-full rounded-xl border border-input bg-background px-3 py-2 text-base" />
          <div className="flex gap-2">
            <button disabled={busy} onClick={() => void send()} className="h-11 px-5 rounded-full bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">{busy ? "Versturen…" : "Doorsturen naar Jason"}</button>
            <button onClick={() => setOpenForm(false)} className="h-11 px-4 rounded-full text-sm text-muted-foreground">Annuleren</button>
          </div>
          <p className="text-xs text-muted-foreground">De klant krijgt pas bericht nadat Jason het nagekeken heeft.</p>
        </div>
      )}
    </div>
  );
}

function ClientProfile({ id, onBack, portal, onChange }: { id: string; onBack: () => void; portal: Portal; onChange: () => void }) {
  const get = useServerFn(myClient), doc = useServerFn(myDocLink);
  const [v, setV] = useState<ClientView | null>(null), [error, setError] = useState("");
  useEffect(() => { get({ data: { client_id: id } }).then(setV).catch((e) => setError(errText(e))); }, [get, id]);
  const tasks = portal.tasks.filter((t) => t.client_id === id && !t.done_at), reqs = portal.requests.filter((r) => r.client_id === id && r.status !== "klaar");
  async function openDoc(docId: string) {
    try { const r = await doc({ data: { doc_id: docId } }); window.open(r.url, "_blank", "noopener"); } catch (e) { toast.error(errText(e)); }
  }
  const statusDot = (s: string | null) => (s === "up" ? "bg-emerald-400" : s === "down" ? "bg-red-500" : s === "degraded" ? "bg-amber-400" : "bg-muted-foreground");
  const statusText = (s: string | null) => (s === "up" ? "Online" : s === "down" ? "Offline" : s === "degraded" ? "Traag of deels" : "Nog niet gecheckt");
  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b border-border">
        <div className="max-w-3xl mx-auto px-2 h-16 flex items-center gap-1">
          <button onClick={onBack} aria-label="Terug" className="w-11 h-11 grid place-items-center rounded-full"><ArrowLeft className="w-5 h-5" /></button>
          <span className="font-semibold truncate">{v?.client.name ?? "Klant"}</span>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 pt-5 space-y-6">
        {error && <p className={`${card} p-4`}>{error}</p>}
        {!v && !error && <p className="text-muted-foreground">Laden…</p>}
        {v && (
          <>
            <section className={`${card} p-4`}>
              <div className="flex items-center gap-3">
                <span className="w-4 h-4 rounded-full" style={{ backgroundColor: v.client.brand_color || "hsl(var(--primary))" }} />
                <div className="min-w-0">
                  <div className="text-lg font-semibold">{v.client.name}</div>
                  <div className="text-sm text-muted-foreground">{[v.client.sector, v.client.location].filter(Boolean).join(" · ")}</div>
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-muted-foreground">Status</dt><dd className="font-medium">{v.client.status === "Active" ? "Actief" : v.client.status}</dd></div>
                <div><dt className="text-muted-foreground">Contactpersoon</dt><dd className="font-medium">{v.client.contact_name || "—"}</dd></div>
                <div className="col-span-2"><dt className="text-muted-foreground">Diensten</dt><dd className="font-medium">{v.client.services.length ? v.client.services.join(" · ") : "—"}</dd></div>
              </dl>
              <p className="mt-3 text-xs text-muted-foreground">Contact met de klant loopt via Jason.</p>
            </section>

            <section>
              <h2 className="text-sm font-medium text-muted-foreground mb-2">Websites en apps</h2>
              {v.sites.length ? (
                <div className={`${card} divide-y divide-border`}>
                  {v.sites.map((s) => (
                    <div key={s.url} className="p-4">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${statusDot(s.last_status)}`} />
                        <span className="font-medium flex-1 truncate">{s.name}</span>
                        <span className="text-sm text-muted-foreground">{statusText(s.last_status)}</span>
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        Laatst gecheckt {ago(s.last_checked_at)}{s.last_response_ms ? ` · ${s.last_response_ms} ms` : ""}{s.ssl_ok === false ? " · SSL-probleem" : ""}
                        {s.last_deploy_at ? ` · laatste update ${ago(s.last_deploy_at)}` : ""}
                      </div>
                      <div className="flex flex-wrap gap-2 mt-3">
                        <a href={s.url} target="_blank" rel="noopener noreferrer" className="h-10 px-3.5 rounded-full border border-border text-sm inline-flex items-center gap-2"><Globe className="w-4 h-4" />Website<ExternalLink className="w-3.5 h-3.5 opacity-60" /></a>
                        {s.repo && <a href={/^https?:/.test(s.repo) ? s.repo : `https://github.com/${s.repo}`} target="_blank" rel="noopener noreferrer" className="h-10 px-3.5 rounded-full border border-border text-sm inline-flex items-center gap-2"><Github className="w-4 h-4" />GitHub<ExternalLink className="w-3.5 h-3.5 opacity-60" /></a>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className={`${card} px-4 py-5 text-muted-foreground`}>Nog geen website gekoppeld.</p>}
            </section>

            <section>
              <h2 className="text-sm font-medium text-muted-foreground mb-2">Bestanden en assets</h2>
              <div className={`${card} divide-y divide-border`}>
                {v.client.drive_url ? (
                  <a href={v.client.drive_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-4 py-4 hover:bg-muted/30">
                    <FolderOpen className="w-5 h-5 text-primary" /><span className="flex-1 font-medium">Google Drive-map</span><ExternalLink className="w-4 h-4 text-muted-foreground" />
                  </a>
                ) : <p className="px-4 py-4 text-muted-foreground text-sm">Nog geen Drive-map gekoppeld. Vraag Jason om de link.</p>}
                {v.docs.map((d: any) => (
                  <button key={d.id} onClick={() => void openDoc(d.id)} className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/30">
                    <FileText className="w-5 h-5 text-muted-foreground shrink-0" />
                    <span className="flex-1 min-w-0"><span className="block truncate">{d.title || d.file_name}</span><span className="block text-xs text-muted-foreground">{new Date(d.created_at).toLocaleDateString("nl-BE")}</span></span>
                  </button>
                ))}
              </div>
            </section>

            {(tasks.length > 0 || reqs.length > 0) && (
              <Section title="Jouw werk voor deze klant" count={tasks.length + reqs.length}>
                {reqs.map((r) => <RequestRow key={r.id} r={r} onChange={onChange} onClient={() => {}} />)}
                {tasks.map((t) => <TaskRow key={t.id} t={t} today={portal.today} onChange={onChange} onClient={() => {}} />)}
              </Section>
            )}
            <p className="text-xs text-muted-foreground flex items-center gap-1.5"><RotateCcw className="w-3.5 h-3.5" />Alleen lezen. Aanpassingen aan de klant doet Jason.</p>
          </>
        )}
      </main>
    </div>
  );
}
