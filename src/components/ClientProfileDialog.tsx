import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Globe, Mail, MapPin, Phone, Send, User } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { clientMRR, clientMRRBreakdown, type FeeClient } from "@/lib/fees";
import { formatCurrency, formatDate } from "@/lib/format";

export type ProfileClient = FeeClient & {
  id: string; name: string; status: string; pipeline_stage?: string | null; sector?: string | null; location?: string | null;
  contact_name?: string | null; contact_phone?: string | null; contact_email?: string | null; billing_address?: string | null; vat_number?: string | null;
  contract_start_date?: string | null; renewal_date?: string | null; next_followup_date?: string | null; notes?: string | null; social_videos_per_month?: number | null;
};
type Invoice = { id: string; date: string; total?: number | string | null; status?: string | null; scheduled_send_at?: string | null; next_repeat_on?: string | null; repeat_monthly?: boolean | null };

/** Everything about one client at a glance, opened from the Brain. */
export function ClientProfileDialog({ client, color, sites, invoices, tasks, videos, onClose, onSend, children }: {
  client: ProfileClient | null; color: string;
  sites: { id: string; name: string; last_status: string | null }[];
  invoices: Invoice[];
  tasks: { id: string; title: string; due_date: string | null; done_at: string | null; assignee: string }[];
  videos: { sent: number; posted: number } | null;
  onClose: () => void;
  /** send a planned invoice now; resolves when it is done */
  onSend?: (invoiceId: string) => Promise<void>;
  /** things to do right here: add a task, tick off a video */
  children?: React.ReactNode;
}) {
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  if (!client) return null;
  const mrr = clientMRR(client), split = clientMRRBreakdown(client);
  const paid = invoices.filter((v) => v.status === "Paid"), open = invoices.filter((v) => v.status === "Sent");
  const planned = invoices.filter((v) => v.status === "Draft" && v.scheduled_send_at).sort((a, b) => String(a.scheduled_send_at).localeCompare(String(b.scheduled_send_at)));
  const sum = (rows: Invoice[]) => rows.reduce((a, v) => a + Number(v.total || 0), 0);
  const openTasks = tasks.filter((t) => !t.done_at);
  const lastPaid = [...paid].sort((a, b) => b.date.localeCompare(a.date))[0];
  const contact: [typeof User, string | null | undefined, string?][] = [
    [User, client.contact_name], [Mail, client.contact_email, client.contact_email ? `mailto:${client.contact_email}` : undefined],
    [Phone, client.contact_phone, client.contact_phone ? `tel:${client.contact_phone.replace(/\s/g, "")}` : undefined], [MapPin, client.billing_address || client.location],
  ];
  const services = ([["SEO", split.seo], ["Website", split.website], ["Social media", split.social]] as [string, number][]).filter(([, v]) => v > 0);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[88dvh] overflow-y-auto border-white/10 bg-[rgba(8,11,24,0.96)] text-white backdrop-blur-2xl p-0 gap-0 rounded-3xl">
        <div className="p-5 sm:p-6 flex items-center gap-4 border-b border-white/10" style={{ background: `linear-gradient(120deg, ${color}33, transparent 70%)` }}>
          <span className="relative w-16 h-16 rounded-full overflow-hidden grid place-items-center shrink-0 ring-2 bg-[#05070f]" style={{ ["--tw-ring-color" as string]: color }}>
            <span className="text-lg font-semibold" style={{ color }}>{client.name.split(/[\s-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}</span>
            <img src={`/logos/${client.id}.png`} alt="" className="absolute inset-0 w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
          </span>
          <div className="min-w-0">
            <DialogTitle className="text-xl sm:text-2xl font-semibold tracking-tight truncate">{client.name}</DialogTitle>
            <DialogDescription className="text-sm text-white/60">
              {[client.status === "Active" ? "Actieve klant" : client.pipeline_stage || client.status, client.sector && client.sector !== "Other" ? client.sector : null, client.contract_start_date ? `sinds ${formatDate(client.contract_start_date)}` : null].filter(Boolean).join(" · ")}
            </DialogDescription>
          </div>
        </div>

        <div className="p-5 sm:p-6 space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Tile label="Per maand" value={formatCurrency(mrr)} />
            <Tile label="Betaald" value={formatCurrency(sum(paid))} sub={lastPaid ? `laatst ${formatDate(lastPaid.date)}` : undefined} />
            <Tile label="Openstaand" value={formatCurrency(sum(open))} warn={sum(open) > 0} />
            <Tile label="Open taken" value={String(openTasks.length)} />
          </div>

          <Block title="Contact">
            {contact.some(([, v]) => v) ? (
              <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                {contact.filter(([, v]) => v).map(([Icon, v, href], i) => (
                  <li key={i} className="flex items-start gap-2 min-w-0"><Icon className="w-4 h-4 mt-0.5 shrink-0 text-white/40" />{href ? <a href={href} className="truncate underline-offset-2 hover:underline">{v}</a> : <span className="break-words min-w-0">{v}</span>}</li>
                ))}
              </ul>
            ) : <Empty>Nog geen contactgegevens ingevuld.</Empty>}
            {client.vat_number && <p className="text-xs text-white/50 mt-2">Btw {client.vat_number}</p>}
          </Block>

          <Block title="Wat ze afnemen">
            {services.length ? (
              <ul className="space-y-1.5 text-sm">
                {services.map(([name, v]) => <li key={name} className="flex justify-between"><span>{name}</span><span className="tabular-nums font-medium">{formatCurrency(v)}<span className="text-white/40 font-normal"> /mnd</span></span></li>)}
                {Number(client.social_videos_per_month) > 0 && <li className="flex justify-between text-white/60"><span>Video's per maand</span><span className="tabular-nums">{videos ? `${videos.sent}/${client.social_videos_per_month} verstuurd · ${videos.posted} geplaatst` : client.social_videos_per_month}</span></li>}
              </ul>
            ) : <Empty>Geen maandelijkse diensten.</Empty>}
          </Block>

          {sites.length > 0 && (
            <Block title="Websites">
              <ul className="space-y-1.5 text-sm">
                {sites.map((s) => <li key={s.id} className="flex items-center gap-2"><Globe className="w-4 h-4 text-white/40" /><span className="flex-1 truncate">{s.name}</span><span className={`inline-flex items-center gap-1.5 text-xs ${s.last_status === "down" ? "text-red-400" : "text-emerald-400"}`}><span className={`w-1.5 h-1.5 rounded-full ${s.last_status === "down" ? "bg-red-400" : "bg-emerald-400"}`} />{s.last_status === "down" ? "offline" : "online"}</span></li>)}
              </ul>
            </Block>
          )}

          <Block title="Komende facturen">
            {planned.length ? (
              <ul className="space-y-1.5 text-sm">
                {planned.slice(0, 4).map((v) => (
                  <li key={v.id} className="flex items-center gap-3 min-h-9">
                    <span className="flex-1">{formatDate(String(v.scheduled_send_at))}{v.repeat_monthly ? <span className="text-white/40"> · maandelijks</span> : null}</span>
                    <span className="tabular-nums font-medium">{formatCurrency(Number(v.total || 0))}</span>
                    {onSend && (confirm === v.id ? (
                      <span className="inline-flex gap-1">
                        <button disabled={busy === v.id} onClick={async () => { setBusy(v.id); try { await onSend(v.id); } finally { setBusy(null); setConfirm(null); } }} className="press h-8 px-3 rounded-full bg-white text-black text-xs font-semibold disabled:opacity-60">{busy === v.id ? "Versturen…" : "Ja, verstuur"}</button>
                        <button onClick={() => setConfirm(null)} className="press h-8 px-3 rounded-full bg-white/10 text-xs">Annuleer</button>
                      </span>
                    ) : (
                      <button onClick={() => setConfirm(v.id)} className="press h-8 px-3 rounded-full bg-white/10 hover:bg-white/15 text-xs inline-flex items-center gap-1.5"><Send className="w-3.5 h-3.5" />Verstuur nu</button>
                    ))}
                  </li>
                ))}
                {planned.length > 4 && <li className="text-xs text-white/40">+ {planned.length - 4} later</li>}
              </ul>
            ) : <Empty>Niets ingepland.</Empty>}
          </Block>

          {children}

          {client.notes && <Block title="Notities"><p className="text-sm text-white/75 whitespace-pre-wrap">{client.notes}</p></Block>}

          <Link to="/clients/$id" params={{ id: client.id }} className="press w-full h-12 rounded-full bg-white text-black font-semibold inline-flex items-center justify-center gap-2">Open klantpagina <ArrowRight className="w-4 h-4" /></Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
const Tile = ({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) => (
  <div className="rounded-2xl bg-white/5 px-3 py-2.5"><div className="text-[11px] text-white/50">{label}</div><div className={`text-lg font-semibold tabular-nums ${warn ? "text-amber-400" : ""}`}>{value}</div>{sub && <div className="text-[11px] text-white/40">{sub}</div>}</div>
);
const Block = ({ title, children }: { title: string; children: React.ReactNode }) => <section><h3 className="text-xs font-medium text-white/50 mb-2">{title}</h3>{children}</section>;
const Empty = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-white/40">{children}</p>;
