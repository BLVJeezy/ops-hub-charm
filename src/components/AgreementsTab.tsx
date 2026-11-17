import { useEffect, useMemo, useState } from "react";
import { Download, FileSignature, Pencil, Plus, Trash2, Eye } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { formatCurrency, formatDate } from "@/lib/format";
import { downloadAgreementPDF, parseAgreement, socialAgreementBody, socialAgreementTitle } from "@/lib/agreements";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

type Agreement = {
  id: string; client_id: string; reference: string; title: string; kind: string; body: string;
  status: "Concept" | "Verstuurd" | "Ondertekend" | "Beëindigd"; start_date: string | null; monthly_fee: number | null; signed_at: string | null; created_at: string;
};
type Client = { id: string; name: string; status: string; billing_address: string | null; vat_number: string | null; contact_name: string | null; social_monthly_fee: number | null };

const STATUSES = ["Concept", "Verstuurd", "Ondertekend", "Beëindigd"] as const;
const STATUS_STYLE: Record<string, string> = {
  Concept: "bg-muted text-muted-foreground",
  Verstuurd: "bg-sky-500/15 text-sky-400",
  Ondertekend: "bg-emerald-500/15 text-emerald-400",
  Beëindigd: "bg-red-500/15 text-red-400",
};

export function AgreementsTab() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [rows, setRows] = useState<Agreement[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [open, setOpen] = useState<Agreement | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    const [a, c] = await Promise.all([
      db.from("client_agreements").select("*").order("created_at"),
      db.from("clients").select("id,name,status,billing_address,vat_number,contact_name,social_monthly_fee").order("name"),
    ]);
    setRows(a.data ?? []);
    setClients(c.data ?? []);
  }
  useEffect(() => { load(); }, []);

  const groups = useMemo(() => {
    const byClient = new Map<string, Agreement[]>();
    for (const r of rows) byClient.set(r.client_id, [...(byClient.get(r.client_id) ?? []), r]);
    return [...byClient.entries()]
      .map(([id, list]) => ({ client: clients.find((c) => c.id === id), list }))
      .sort((a, b) => (a.client?.name ?? "").localeCompare(b.client?.name ?? ""));
  }, [rows, clients]);

  async function setStatus(a: Agreement, status: Agreement["status"]) {
    const patch: Partial<Agreement> = { status };
    if (status === "Ondertekend" && !a.signed_at) patch.signed_at = new Date().toISOString().slice(0, 10);
    const { error } = await db.from("client_agreements").update(patch).eq("id", a.id);
    if (error) toast.error(error.message); else load();
  }
  async function remove(a: Agreement) {
    if (!confirm(`Overeenkomst ${a.reference} verwijderen? Dit kan niet ongedaan worden.`)) return;
    const { error } = await db.from("client_agreements").delete().eq("id", a.id);
    if (error) toast.error(error.message); else { toast.success("Verwijderd"); load(); }
  }
  const pdf = (a: Agreement) => {
    const c = clients.find((x) => x.id === a.client_id);
    downloadAgreementPDF({ reference: a.reference, title: a.title, body: a.body, clientName: c?.name ?? "", representative: c?.contact_name });
  };

  const active = rows.filter((r) => r.status === "Ondertekend" || r.status === "Verstuurd" || r.status === "Concept");
  const monthly = rows.filter((r) => r.status === "Ondertekend").reduce((s, r) => s + Number(r.monthly_fee || 0), 0);

  return (
    <div className="space-y-3 mt-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium">Samenwerkingsovereenkomsten</div>
          <div className="text-xs text-muted-foreground tabular-nums">{active.length} lopend · {formatCurrency(monthly)}/maand ondertekend</div>
        </div>
        {isAdmin && <Button onClick={() => setCreating(true)} className="rounded-full h-9 px-3"><Plus className="w-4 h-4 mr-1" />Nieuwe</Button>}
      </div>

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Nog geen overeenkomsten. Maak er een met Nieuwe.</div>
      ) : (
        <div className="grid gap-2 md:grid-cols-2 3xl:grid-cols-3">
          {groups.map(({ client, list }) => (
            <div key={client?.id ?? list[0].client_id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <FileSignature className="w-4 h-4 text-[#C9A14A]" />
                <div className="font-semibold truncate flex-1">{client?.name ?? "Onbekende klant"}</div>
              </div>
              <ul className="divide-y divide-border">
                {list.map((a) => (
                  <li key={a.id} className="py-2 flex items-center gap-2">
                    <button onClick={() => setOpen(a)} className="press flex-1 min-w-0 text-left">
                      <div className="text-sm truncate">{a.title.replace(/^Samenwerkingsovereenkomst /, "")}</div>
                      <div className="text-[11px] text-muted-foreground tabular-nums">
                        {a.reference}{a.start_date ? ` · vanaf ${formatDate(a.start_date)}` : " · start bij eerste betaling"}{a.monthly_fee ? ` · ${formatCurrency(Number(a.monthly_fee))}/mnd` : ""}{a.signed_at ? ` · getekend ${formatDate(a.signed_at)}` : ""}
                      </div>
                    </button>
                    {isAdmin ? (
                      <select value={a.status} onChange={(e) => setStatus(a, e.target.value as Agreement["status"])} aria-label="Status"
                        className={`shrink-0 rounded-full px-2.5 h-8 text-xs font-medium border-0 ${STATUS_STYLE[a.status]}`}>
                        {STATUSES.map((s) => <option key={s} value={s} className="bg-card text-foreground">{s}</option>)}
                      </select>
                    ) : <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${STATUS_STYLE[a.status]}`}>{a.status}</span>}
                    <Button size="icon" variant="ghost" className="hit h-9 w-9" onClick={() => pdf(a)} aria-label="Download PDF" title="Download PDF"><Download className="w-3.5 h-3.5" /></Button>
                    {isAdmin && <Button size="icon" variant="ghost" className="hit h-9 w-9" onClick={() => remove(a)} aria-label="Verwijderen" title="Verwijderen"><Trash2 className="w-3.5 h-3.5 text-muted-foreground" /></Button>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <AgreementDialog agreement={open} canEdit={isAdmin} onClose={() => setOpen(null)} onSaved={load} onPdf={pdf} />
      <NewAgreementDialog open={creating} onClose={() => setCreating(false)} clients={clients.filter((c) => c.status === "Active" || c.status === "Prospect")} existing={rows} onSaved={load} />
    </div>
  );
}

function AgreementDialog({ agreement, canEdit, onClose, onSaved, onPdf }: { agreement: Agreement | null; canEdit: boolean; onClose: () => void; onSaved: () => void; onPdf: (a: Agreement) => void }) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState("");
  useEffect(() => { setEditing(false); setBody(agreement?.body ?? ""); }, [agreement]);
  if (!agreement) return null;
  async function save() {
    const { error } = await db.from("client_agreements").update({ body }).eq("id", agreement!.id);
    if (error) toast.error(error.message); else { toast.success("Opgeslagen"); setEditing(false); onSaved(); }
  }
  return (
    <Dialog open={!!agreement} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[88vh] flex flex-col">
        <DialogHeader><DialogTitle className="pr-6">{agreement.title}</DialogTitle></DialogHeader>
        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {editing ? (
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="min-h-[55vh] font-mono text-xs leading-relaxed" />
          ) : (
            <article className="space-y-2 text-sm leading-relaxed">
              {parseAgreement(agreement.body).map((b, i) =>
                b.type === "h" ? <h3 key={i} className="pt-2 font-semibold">{b.text}</h3>
                  : b.type === "li" ? <p key={i} className="pl-4 -indent-3 text-muted-foreground">• {b.text}</p>
                  : <p key={i} className="text-muted-foreground">{b.text}</p>,
              )}
            </article>
          )}
        </div>
        <div className="flex gap-2 pt-2">
          {canEdit && (editing
            ? <><Button onClick={save} className="rounded-full">Opslaan</Button><Button variant="ghost" onClick={() => { setEditing(false); setBody(agreement.body); }}>Annuleren</Button></>
            : <Button variant="outline" onClick={() => setEditing(true)} className="rounded-full"><Pencil className="w-3.5 h-3.5 mr-1.5" />Tekst bewerken</Button>)}
          <Button onClick={() => onPdf(agreement)} className="rounded-full ml-auto"><Download className="w-3.5 h-3.5 mr-1.5" />PDF</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NewAgreementDialog({ open, onClose, clients, existing, onSaved }: { open: boolean; onClose: () => void; clients: Client[]; existing: Agreement[]; onSaved: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [clientId, setClientId] = useState("");
  const [f, setF] = useState({ legal: "", trade: "", address: "", vat: "", rep: "", start: today, fee: "150", videos: "11", revisions: "1", notice: "1", delivery: "30", trial: "1" });
  const c = clients.find((x) => x.id === clientId);
  useEffect(() => {
    if (!c) return;
    setF((p) => ({ ...p, legal: c.name, trade: "", address: c.billing_address ?? "", vat: c.vat_number ?? "", rep: c.contact_name ?? "", fee: String(c.social_monthly_fee || p.fee) }));
  }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  const year = new Date().getFullYear();
  const nextRef = () => {
    const n = existing.filter((a) => a.reference.startsWith(`SG-SM-${year}-`)).map((a) => Number(a.reference.split("-").pop())).reduce((m, x) => Math.max(m, x || 0), 0) + 1;
    return `SG-SM-${year}-${String(n).padStart(3, "0")}`;
  };

  async function create() {
    if (!c) return toast.error("Kies een klant");
    const input = {
      reference: nextRef(), clientName: f.legal.trim() || c.name, tradeName: f.trade.trim() || null, address: f.address.trim() || null,
      vatNumber: f.vat.trim() || null, representative: f.rep.trim() || null, startDate: f.start || null, monthlyFee: Number(f.fee) || 0,
      videosPerMonth: Number(f.videos) || 0, revisionsPerVideo: Number(f.revisions) || 0, noticeMonths: Number(f.notice) || 1, deliveryDays: Number(f.delivery) || null, trialMonths: Number(f.trial) || null,
    };
    const { data: u } = await supabase.auth.getUser();
    const { error } = await db.from("client_agreements").insert({
      client_id: c.id, reference: input.reference, title: socialAgreementTitle(input), kind: "social_media", body: socialAgreementBody(input),
      status: "Concept", start_date: input.startDate, monthly_fee: input.monthlyFee, created_by: u.user?.id,
    });
    if (error) return toast.error(error.message);
    toast.success(`Overeenkomst ${input.reference} gemaakt`);
    onClose(); onSaved();
  }

  const field = (k: keyof typeof f, label: string, type = "text") => (
    <label className="block">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Input type={type} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className="mt-1 h-9" />
    </label>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Nieuwe overeenkomst · social media</DialogTitle></DialogHeader>
        <label className="block">
          <span className="text-xs text-muted-foreground">Klant</span>
          <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="mt-1 w-full h-9 rounded-md border border-input bg-card px-2 text-sm">
            <option value="">Kies een klant…</option>
            {clients.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          {field("legal", "Juridische naam")}
          {field("trade", "Handelsnaam (optioneel)")}
          {field("address", "Adres")}
          {field("vat", "Ondernemingsnummer")}
          {field("rep", "Vertegenwoordigd door")}
          {field("start", "Startdatum (leeg = bij de eerste betaling)", "date")}
          {field("fee", "€ per maand excl. btw", "number")}
          {field("videos", "Video's per maand", "number")}
          {field("revisions", "Revisies per video", "number")}
          {field("notice", "Opzeg in maanden", "number")}
          {field("delivery", "Levertijd in dagen na betaling", "number")}
          {field("trial", "Proefperiode in maanden (leeg = geen)", "number")}
        </div>
        <div className="flex gap-2 pt-1">
          <Button onClick={create} className="rounded-full"><Eye className="w-3.5 h-3.5 mr-1.5" />Maak overeenkomst</Button>
          <Button variant="ghost" onClick={onClose}>Annuleren</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
