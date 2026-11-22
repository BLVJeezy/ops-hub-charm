import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Link2, Plus, UserPlus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { assignItem, createTaskFor, inviteMember, listTeam, resendInvite, updateMember } from "@/lib/team.functions";
import { accessLabel, memberOpen, memberSeesClient, type TeamMember } from "@/lib/team";
import { KINDS } from "@/lib/client-requests";
import { brusselsToday } from "@/lib/invoice-schedule";

export const Route = createFileRoute("/_authenticated/teamleden")({ component: TeamPage });

type Data = Awaited<ReturnType<typeof listTeam>>;
const errText = (e: unknown) => (e instanceof Error ? e.message : "Er ging iets mis.");
const kindLabel = (k: string) => KINDS.find((x) => x.id === k)?.label ?? k;
const card = "rounded-2xl border border-border bg-card";
const input = "w-full h-11 rounded-xl border border-input bg-background px-3 text-base sm:text-sm";
const addMonths = (n: number) => { const d = new Date(); d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 10); };
const ago = (iso?: string | null) => {
  if (!iso) return "nog nooit ingelogd";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return "laatst actief " + (m < 60 ? `${m} min geleden` : m < 1440 ? `${Math.round(m / 60)} u geleden` : `${Math.round(m / 1440)} d geleden`);
};

function TeamPage() {
  const load = useServerFn(listTeam);
  const [data, setData] = useState<Data | null>(null);
  const [edit, setEdit] = useState<TeamMember | "new" | null>(null);
  const [taskFor, setTaskFor] = useState<TeamMember | null>(null);
  const refresh = useCallback(() => load().then(setData).catch((e) => toast.error(errText(e))), [load]);
  useEffect(() => { void refresh(); }, [refresh]);
  const today = brusselsToday();
  const clientName = useMemo(() => new Map((data?.clients ?? []).map((c) => [c.id, c.name])), [data]);

  if (!data) return <div className="p-6 text-muted-foreground">Laden…</div>;
  const unassigned = data.requests.filter((r) => !r.assignee_user_id);
  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Team</h1>
          <p className="text-sm text-muted-foreground mt-1">Mensen die meewerken krijgen hun eigen login met een beperkt overzicht.</p>
        </div>
        <button onClick={() => setEdit("new")} className="h-11 px-4 rounded-full bg-primary text-primary-foreground text-sm font-medium inline-flex items-center gap-2 shrink-0"><UserPlus className="w-4 h-4" /><span className="hidden sm:inline">Iemand toevoegen</span><span className="sm:hidden">Toevoegen</span></button>
      </div>

      {data.members.length === 0 ? (
        <div className={`${card} p-5`}>
          <p className="font-medium">Nog niemand in je team.</p>
          <p className="text-sm text-muted-foreground mt-1">Voeg een medewerker of freelancer toe. Die krijgt een mail met een link om een wachtwoord te kiezen en logt daarna in op {typeof window !== "undefined" ? window.location.origin : ""}/team.</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.members.map((m) => (
            <MemberCard key={m.user_id} m={m} data={data} today={today} clientName={clientName} onEdit={() => setEdit(m)} onTask={() => setTaskFor(m)} onChange={refresh} />
          ))}
        </div>
      )}

      {data.members.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-muted-foreground mb-2">Open aanvragen zonder iemand ({unassigned.length})</h2>
          {unassigned.length ? (
            <div className={`${card} divide-y divide-border`}>
              {unassigned.map((r) => (
                <div key={r.id} className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{r.title}</div>
                    <div className="text-xs text-muted-foreground">{[r.client_id ? clientName.get(r.client_id) : null, kindLabel(r.kind)].filter(Boolean).join(" · ")}</div>
                  </div>
                  <AssignSelect type="request" id={r.id} clientId={r.client_id} members={data.members} today={today} value={null} onChange={refresh} />
                </div>
              ))}
            </div>
          ) : <p className={`${card} px-4 py-4 text-sm text-muted-foreground`}>Alles is verdeeld of bij jou ingepland.</p>}
        </section>
      )}

      <details className={`${card} px-4 py-3 text-sm`}>
        <summary className="cursor-pointer font-medium py-1">Wat ziet een teamlid?</summary>
        <ul className="mt-2 space-y-1.5 text-muted-foreground list-disc pl-5">
          <li>Alleen zijn eigen taken en aanvragen. Taken kan hij afvinken; een aanvraag stuurt hij terug naar jou als "klaar voor controle". De klant krijgt pas een mail als jij hem afsluit in Aanvragen.</li>
          <li>Per klant (alleen de klanten die je aanduidt): status, diensten, contactpersoon, websites met hun live-check, GitHub, de Drive-map en de bestanden. Alles alleen lezen.</li>
          <li>Geen bedragen, facturen, finance, contactgegevens van klanten, je agenda, je pincode of de rest van de Hub.</li>
          <li>Toegang stopt automatisch op de einddatum, of meteen als je op Stoppen tikt.</li>
        </ul>
      </details>

      {edit && <MemberDialog member={edit === "new" ? null : edit} clients={data.clients} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); void refresh(); }} />}
      {taskFor && <TaskDialog member={taskFor} clients={data.clients.filter((c) => memberSeesClient(taskFor, c.id))} onClose={() => setTaskFor(null)} onSaved={() => { setTaskFor(null); void refresh(); }} />}
    </div>
  );
}

function MemberCard({ m, data, today, clientName, onEdit, onTask, onChange }: { m: TeamMember; data: Data; today: string; clientName: Map<string, string>; onEdit: () => void; onTask: () => void; onChange: () => void }) {
  const update = useServerFn(updateMember), resend = useServerFn(resendInvite);
  const open = memberOpen(m, today);
  const tasks = data.tasks.filter((t) => t.assignee_user_id === m.user_id && !t.done_at);
  const reqs = data.requests.filter((r) => r.assignee_user_id === m.user_id);
  const review = reqs.filter((r) => r.review_ready_at);
  async function toggle() {
    if (open && !confirm(`Toegang van ${m.full_name} nu stoppen? Hij of zij kan dan niet meer inloggen op het overzicht.`)) return;
    try { await update({ data: { user_id: m.user_id, active: !m.active } }); onChange(); } catch (e) { toast.error(errText(e)); }
  }
  async function link() {
    try { const r = await resend({ data: { user_id: m.user_id } }); toast.success(r.mailed ? `Nieuwe link gemaild naar ${m.email}` : "Link gemaakt, maar de mail ging niet weg"); } catch (e) { toast.error(errText(e)); }
  }
  return (
    <div className={`${card} p-4 ${open ? "" : "opacity-70"}`}>
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-full bg-primary/15 text-primary grid place-items-center font-semibold shrink-0">{m.full_name.split(" ").map((x) => x[0]).slice(0, 2).join("")}</div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold truncate">{m.full_name}</div>
          <div className="text-sm text-muted-foreground truncate">{[m.title, m.email].filter(Boolean).join(" · ")}</div>
          <div className={`text-xs mt-1 ${open ? "text-muted-foreground" : "text-amber-400"}`}>{accessLabel(m, today)} · {ago(m.last_seen_at)}</div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
        {m.auto_kinds.length ? m.auto_kinds.map((k) => <span key={k} className="rounded-full bg-muted px-2.5 py-1">{kindLabel(k)}</span>) : <span className="text-muted-foreground">Krijgt niets automatisch</span>}
      </div>
      <div className="mt-2 text-xs text-muted-foreground">Klanten: {m.client_ids?.length ? m.client_ids.map((id) => clientName.get(id) ?? "?").join(", ") : "alle actieve klanten"}</div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-muted/40 py-2"><div className="text-lg font-semibold tabular-nums">{tasks.length}</div><div className="text-[11px] text-muted-foreground">taken open</div></div>
        <div className="rounded-xl bg-muted/40 py-2"><div className="text-lg font-semibold tabular-nums">{reqs.length - review.length}</div><div className="text-[11px] text-muted-foreground">aanvragen</div></div>
        <div className={`rounded-xl py-2 ${review.length ? "bg-primary/15 text-primary" : "bg-muted/40"}`}><div className="text-lg font-semibold tabular-nums">{review.length}</div><div className="text-[11px] opacity-80">na te kijken</div></div>
      </div>
      {(tasks.length > 0 || reqs.length > 0) && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-muted-foreground py-1">Bekijk en verdeel</summary>
          <ul className="mt-1 divide-y divide-border">
            {reqs.map((r) => (
              <li key={r.id} className="py-2 flex items-center gap-2">
                <span className="flex-1 min-w-0 truncate">{r.review_ready_at ? "✅ " : ""}{r.title}</span>
                <AssignSelect type="request" id={r.id} clientId={r.client_id} members={data.members} today={today} value={m.user_id} onChange={onChange} />
              </li>
            ))}
            {tasks.map((t) => (
              <li key={t.id} className="py-2 flex items-center gap-2">
                <span className="flex-1 min-w-0 truncate">{t.title}</span>
                <AssignSelect type="task" id={t.id} clientId={t.client_id} members={data.members} today={today} value={m.user_id} onChange={onChange} />
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={onTask} disabled={!open} className="h-10 px-3.5 rounded-full bg-primary text-primary-foreground text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-40"><Plus className="w-4 h-4" />Taak geven</button>
        <button onClick={onEdit} className="h-10 px-3.5 rounded-full border border-border text-sm">Bewerken</button>
        <button onClick={() => void link()} className="h-10 px-3.5 rounded-full border border-border text-sm inline-flex items-center gap-1.5"><Link2 className="w-4 h-4" />Nieuwe link</button>
        <button onClick={() => void toggle()} className={`h-10 px-3.5 rounded-full text-sm ${m.active ? "text-red-400" : "text-emerald-400"}`}>{m.active ? "Stoppen" : "Heractiveren"}</button>
      </div>
    </div>
  );
}

function AssignSelect({ type, id, clientId, members, today, value, onChange }: { type: "task" | "request"; id: string; clientId: string | null; members: TeamMember[]; today: string; value: string | null; onChange: () => void }) {
  const assign = useServerFn(assignItem);
  const options = members.filter((m) => memberOpen(m, today) && memberSeesClient(m, clientId));
  return (
    <select
      aria-label="Toewijzen aan"
      value={value ?? ""}
      onChange={async (e) => {
        try { await assign({ data: { type, id, user_id: e.target.value || null } }); toast.success(e.target.value ? "Toegewezen en gemaild" : "Terug bij jou"); onChange(); } catch (err) { toast.error(errText(err)); }
      }}
      className="h-10 rounded-full border border-input bg-background px-3 text-sm max-w-[180px]"
    >
      <option value="">{value ? "Terug naar mij" : "Toewijzen aan…"}</option>
      {options.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name}</option>)}
    </select>
  );
}

function MemberDialog({ member, clients, onClose, onSaved }: { member: TeamMember | null; clients: { id: string; name: string }[]; onClose: () => void; onSaved: () => void }) {
  const invite = useServerFn(inviteMember), update = useServerFn(updateMember);
  const [f, setF] = useState({
    full_name: member?.full_name ?? "", email: member?.email ?? "", title: member?.title ?? "",
    access_until: member?.access_until ?? addMonths(1), auto_kinds: member?.auto_kinds ?? [], client_ids: member?.client_ids ?? null as string[] | null,
  });
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (f.client_ids && f.client_ids.length === 0) return toast.error("Kies minstens één klant, of zet 'Alle klanten' aan.");
    setBusy(true);
    const common = { full_name: f.full_name, title: f.title || null, access_until: f.access_until || null, auto_kinds: f.auto_kinds as any, client_ids: f.client_ids };
    try {
      if (member) { await update({ data: { user_id: member.user_id, ...common } }); toast.success("Bewaard"); }
      else { const r = await invite({ data: { ...common, email: f.email } }); toast.success(r.mailed ? `Uitnodiging gemaild naar ${f.email}` : "Account gemaakt, maar de mail ging niet weg. Stuur een nieuwe link."); }
      onSaved();
    } catch (err) { toast.error(errText(err)); } finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{member ? `${member.full_name} bewerken` : "Iemand toevoegen"}</DialogTitle></DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <label className="block text-sm">Naam<input required minLength={2} value={f.full_name} onChange={(e) => set({ full_name: e.target.value })} className={`${input} mt-1`} /></label>
          {!member && <label className="block text-sm">E-mail<input type="email" required value={f.email} onChange={(e) => set({ email: e.target.value })} className={`${input} mt-1`} /></label>}
          <label className="block text-sm">Functie<input placeholder="bv. Video-editor, Webdeveloper" value={f.title} onChange={(e) => set({ title: e.target.value })} className={`${input} mt-1`} /></label>
          <div className="text-sm">
            Toegang tot
            <div className="flex flex-wrap gap-2 mt-1.5">
              {([["1 maand", addMonths(1)], ["3 maanden", addMonths(3)], ["Geen einde", ""]] as const).map(([l, v]) => (
                <button type="button" key={l} onClick={() => set({ access_until: v })} className={`h-9 px-3 rounded-full border text-sm ${f.access_until === v ? "border-primary text-primary" : "border-border"}`}>{l}</button>
              ))}
              <input type="date" value={f.access_until} onChange={(e) => set({ access_until: e.target.value })} className="h-9 rounded-full border border-input bg-background px-3 text-sm" />
            </div>
          </div>
          <fieldset className="text-sm">
            <legend>Aanvragen die automatisch naar deze persoon gaan</legend>
            <div className="grid grid-cols-2 gap-2 mt-1.5">
              {KINDS.map((k) => (
                <label key={k.id} className="flex items-center gap-2 rounded-xl border border-border px-3 h-11">
                  <input type="checkbox" checked={f.auto_kinds.includes(k.id)} onChange={(e) => set({ auto_kinds: e.target.checked ? [...f.auto_kinds, k.id] : f.auto_kinds.filter((x) => x !== k.id) })} className="w-4 h-4" />
                  <span className="truncate">{k.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="text-sm">
            <legend>Klanten die deze persoon ziet</legend>
            <label className="mt-1.5 flex items-center gap-2"><input type="checkbox" checked={f.client_ids === null} onChange={(e) => set({ client_ids: e.target.checked ? null : [] })} className="w-4 h-4" />Alle actieve klanten</label>
            {f.client_ids !== null && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                {clients.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 rounded-xl border border-border px-3 h-11">
                    <input type="checkbox" checked={f.client_ids!.includes(c.id)} onChange={(e) => set({ client_ids: e.target.checked ? [...f.client_ids!, c.id] : f.client_ids!.filter((x) => x !== c.id) })} className="w-4 h-4" />
                    <span className="truncate">{c.name}</span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>
          <button disabled={busy} className="w-full h-12 rounded-full bg-primary text-primary-foreground font-medium disabled:opacity-50">{busy ? "Bezig…" : member ? "Bewaren" : "Toevoegen en uitnodiging mailen"}</button>
          {!member && <p className="text-xs text-muted-foreground">Er wordt een account aangemaakt zonder wachtwoord. De persoon kiest zelf een wachtwoord via de link in de mail.</p>}
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TaskDialog({ member, clients, onClose, onSaved }: { member: TeamMember; clients: { id: string; name: string }[]; onClose: () => void; onSaved: () => void }) {
  const create = useServerFn(createTaskFor);
  const [title, setTitle] = useState(""), [client, setClient] = useState(""), [due, setDue] = useState(""), [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try { await create({ data: { user_id: member.user_id, title, client_id: client || null, due_date: due || null } }); toast.success(`Taak gegeven aan ${member.full_name}`); onSaved(); } catch (err) { toast.error(errText(err)); } finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Taak voor {member.full_name}</DialogTitle></DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <label className="block text-sm">Wat moet er gebeuren?<input required minLength={2} maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} className={`${input} mt-1`} /></label>
          <label className="block text-sm">Klant<select value={client} onChange={(e) => setClient(e.target.value)} className={`${input} mt-1`}><option value="">Geen klant</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label className="block text-sm">Tegen<input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={`${input} mt-1`} /></label>
          <button disabled={busy} className="w-full h-12 rounded-full bg-primary text-primary-foreground font-medium disabled:opacity-50">{busy ? "Bezig…" : "Geven en mailen"}</button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

