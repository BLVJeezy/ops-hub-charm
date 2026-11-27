import { useCurrency } from "@/components/CurrencyToggle";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, FileText, Download, Pencil, Send, Bell, CheckCircle2, Trash2, CalendarClock, Repeat, ChevronRight, FileMinus2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState } from "@/components/EmptyState";
import { InvoiceModal, type InvoiceRow } from "@/components/InvoiceModal";
import { formatCurrency, formatDate } from "@/lib/format";
import { downloadInvoicePDF, type LineItem } from "@/lib/invoice-pdf";
import { downloadCreditNotePDF } from "@/lib/credit-note-pdf";
import { creditBadgeKind, formatEURCents, netInvoiceAmount } from "@/lib/credit-note";
import { sendCreditNoteMail } from "@/lib/credit-note.functions";
import { StopRepeatDialog } from "@/components/StopRepeatDialog";
import { CreditNoteDialog } from "@/components/CreditNoteDialog";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useServerFn } from "@tanstack/react-start";
import { sendInvoiceMail } from "@/lib/invoice-send.functions";
import { formatInvoiceNumber } from "@/lib/invoice-code";
import { brusselsToday, hourLabel, plannedForecast } from "@/lib/invoice-schedule";

export const Route = createFileRoute("/_authenticated/invoices")({
  component: Invoices,
});

type Row = InvoiceRow & {
  id: string;
  invoice_number: number;
  sent_at?: string | null;
  last_reminder_at?: string | null;
  reminder_count?: number | null;
  email_status?: string | null;
  delivered_at?: string | null;
  opened_at?: string | null;
  bounced_at?: string | null;
  repeat_stopped_at?: string | null;
  credited_amount?: number | null;
  credited_at?: string | null;
};
type CreditNoteRow = {
  id: string;
  credit_number: string;
  invoice_id: string;
  client: string | null;
  client_name: string | null;
  client_address: string | null;
  client_vat_number: string | null;
  date: string;
  amount: number;
  reason: string;
  line_items: unknown;
  vat_note: string | null;
  status: "Draft" | "Sent";
  sent_at: string | null;
  delivered_at: string | null;
  created_at: string;
};
type Client = { id: string; name: string; billing_address?: string | null; vat_number?: string | null; contact_email?: string | null; brand_color?: string | null };

function RepeatOffIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m17 2 4 4-4 4" />
      <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
      <path d="m7 22-4-4 4-4" />
      <path d="M21 13v1a4 4 0 0 1-4 4H3" />
      <path d="M3 3 21 21" />
    </svg>
  );
}

function isPlanned(r: { status: string; scheduled_send_at?: string | null; repeat_monthly?: boolean }) {
  return (r.status === "Draft" && !!r.scheduled_send_at) || !!r.repeat_monthly;
}

function Invoices() {
  useCurrency();
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [rows, setRows] = useState<Row[]>([]);
  const [creditNotes, setCreditNotes] = useState<CreditNoteRow[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("All");
  const [q, setQ] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [stopTarget, setStopTarget] = useState<Row | null>(null);
  const [creditTarget, setCreditTarget] = useState<Row | null>(null);

  async function load() {
    setLoading(true);
    const [i, c, cn] = await Promise.all([
      supabase.from("invoices").select("*").order("created_at", { ascending: false }),
      supabase.from("clients").select("id,name,billing_address,vat_number,contact_email,brand_color").order("name"),
      supabase.from("credit_notes").select("*").order("created_at", { ascending: false }),
    ]);
    if (i.error) toast.error(i.error.message);
    if (cn.error) toast.error(cn.error.message);
    setRows((i.data as unknown as Row[]) ?? []);
    setClients((c.data as unknown as Client[]) ?? []);
    setCreditNotes((cn.data as unknown as CreditNoteRow[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const ch = supabase.channel("invoices-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "credit_notes" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const [view, setView] = useState<"clients" | "list">(() => {
    try { return localStorage.getItem("invoices-view") === "list" ? "list" : "clients"; } catch { return "clients"; }
  });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const creditsByInvoice = useMemo(() => {
    const map = new Map<string, CreditNoteRow[]>();
    for (const cn of creditNotes) {
      const list = map.get(cn.invoice_id) ?? [];
      list.push(cn);
      map.set(cn.invoice_id, list);
    }
    return map;
  }, [creditNotes]);

  const creditedTotalFor = (invId: string) =>
    (creditsByInvoice.get(invId) ?? []).reduce((s, cn) => s + Number(cn.amount || 0), 0);

  const invoiceById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);

  const filteredCreditNotes = useMemo(() => {
    if (!q.trim()) return creditNotes;
    const s = q.toLowerCase();
    return creditNotes.filter((cn) => {
      const inv = invoiceById.get(cn.invoice_id);
      return (
        (cn.client_name || "").toLowerCase().includes(s) ||
        cn.credit_number.toLowerCase().includes(s) ||
        (inv ? formatInvoiceNumber(inv.invoice_number).toLowerCase().includes(s) : false)
      );
    });
  }, [creditNotes, q, invoiceById]);

  const filtered = useMemo(() => {
    if (tab === "Creditnota's") return [];
    let list = rows;
    if (tab === "Gepland") list = list.filter(isPlanned);
    else if (tab !== "All") list = list.filter((r) => r.status === tab);
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter((r) =>
        (r.client_name || "").toLowerCase().includes(s) ||
        formatInvoiceNumber(r.invoice_number).toLowerCase().includes(s),
      );
    }
    return list;
  }, [rows, tab, q]);

  const totals = useMemo(() => {
    const paid = rows
      .filter((r) => r.status === "Paid")
      .reduce((s, r) => s + netInvoiceAmount(Number(r.total || 0), creditedTotalFor(r.id)), 0);
    const sent = rows
      .filter((r) => r.status === "Sent")
      .reduce((s, r) => s + netInvoiceAmount(Number(r.total || 0), creditedTotalFor(r.id)), 0);
    return { paid, sent };
  }, [rows, creditsByInvoice]);

  async function markStatus(r: Row, status: string) {
    const { error } = await supabase.from("invoices").update({ status } as never).eq("id", r.id);
    if (error) toast.error(error.message);
  }

  function downloadPdf(r: Row) {
    downloadInvoicePDF({
      invoice_number: r.invoice_number,
      date: r.date,
      client_name: r.client_name || "",
      client_address: r.client_address,
      client_vat_number: r.client_vat_number,
      line_items: r.line_items as LineItem[],
      vat_note: r.vat_note,
      total: Number(r.total || 0),
    });
  }

  const sendMailFn = useServerFn(sendInvoiceMail);
  const sendCreditMailFn = useServerFn(sendCreditNoteMail);

  function downloadCreditPdf(cn: CreditNoteRow) {
    const inv = invoiceById.get(cn.invoice_id);
    const rawItems = Array.isArray(cn.line_items) && cn.line_items.length > 0 ? cn.line_items : inv?.line_items;
    downloadCreditNotePDF({
      credit_number: cn.credit_number,
      date: cn.date,
      invoice_number: inv?.invoice_number ?? "",
      invoice_date: inv?.date ?? cn.date,
      invoice_total: Number(inv?.total ?? cn.amount),
      client_name: cn.client_name || inv?.client_name || "",
      client_address: cn.client_address || inv?.client_address || null,
      client_vat_number: cn.client_vat_number || inv?.client_vat_number || null,
      amount: Number(cn.amount || 0),
      reason: cn.reason,
      line_items: Array.isArray(rawItems) ? (rawItems as LineItem[]) : [],
      vat_note: cn.vat_note || inv?.vat_note || null,
    });
  }

  async function sendCreditEmail(cn: CreditNoteRow) {
    const client = clients.find((c) => c.id === cn.client);
    const email = client?.contact_email?.trim();
    if (!email) { toast.error("Klant heeft geen e-mailadres"); return; }
    const t = toast.loading(`Creditnota versturen naar ${email}…`);
    try {
      await sendCreditMailFn({ data: { creditNoteId: cn.id } });
      toast.success(`Creditnota ${cn.credit_number} verstuurd naar ${email}`, { id: t });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Versturen mislukt", { id: t });
    }
  }

  async function deleteInvoiceRow(r: Row) {
    if (!confirm(`Delete invoice ${formatInvoiceNumber(r.invoice_number)}? This cannot be undone.`)) return;
    const { error } = await supabase.from("invoices").delete().eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Invoice deleted");
    load();
  }

  async function sendInvoiceEmail(r: Row) {
    const client = clients.find((c) => c.id === r.client);
    const email = client?.contact_email?.trim();
    if (!email) { toast.error("Klant heeft geen e-mailadres"); return; }
    const t = toast.loading(`Versturen naar ${email}…`);
    try {
      await sendMailFn({ data: { invoiceId: r.id, isReminder: false } });
      toast.success(`Factuur verstuurd naar ${email}`, { id: t });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Versturen mislukt", { id: t });
    }
  }

  const counts = {
    All: rows.length,
    Draft: rows.filter((r) => r.status === "Draft").length,
    Gepland: rows.filter(isPlanned).length,
    Sent: rows.filter((r) => r.status === "Sent").length,
    Paid: rows.filter((r) => r.status === "Paid").length,
    "Creditnota's": creditNotes.length,
  };

  const forecast = plannedForecast(rows as never, brusselsToday(), 6);

  const statusColor: Record<string, string> = {
    Draft: "bg-muted text-muted-foreground",
    Sent: "bg-amber-500/15 text-amber-400",
    Paid: "bg-emerald-500/15 text-emerald-400",
  };

  const groups = useMemo(() => {
    const map = new Map<string, { key: string; name: string; items: Row[]; total: number; paid: number; open: number; planned: number; nextPlanned: string | null; latest: string }>();
    for (const r of filtered) {
      const key = (r as { client?: string | null }).client || r.client_name || "—";
      let g = map.get(key);
      if (!g) { g = { key, name: r.client_name || "Zonder klant", items: [], total: 0, paid: 0, open: 0, planned: 0, nextPlanned: null, latest: "" }; map.set(key, g); }
      const amt = netInvoiceAmount(Number(r.total || 0), creditedTotalFor(r.id));
      g.items.push(r);
      g.total += amt;
      if (r.status === "Paid") g.paid += amt;
      if (r.status === "Sent") g.open += amt;
      if (isPlanned(r)) {
        g.planned++;
        const d = r.status === "Draft" ? r.scheduled_send_at : r.next_repeat_on;
        if (d && (!g.nextPlanned || d < g.nextPlanned)) g.nextPlanned = d;
      }
      if (r.date > g.latest) g.latest = r.date;
    }
    // open money first, then most recent activity
    return [...map.values()].sort((a, b) => (b.open > 0 ? 1 : 0) - (a.open > 0 ? 1 : 0) || b.latest.localeCompare(a.latest));
  }, [filtered, creditsByInvoice]);

  const colorOf: Record<string, string> = Object.fromEntries(clients.filter((c) => c.brand_color).map((c) => [c.id, c.brand_color as string]));

  function toggleGroup(key: string) {
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });
  }

  function setViewMode(v: "clients" | "list") {
    setView(v);
    try { localStorage.setItem("invoices-view", v); } catch { /* storage unavailable */ }
  }

  const renderCreditNoteRow = (cn: CreditNoteRow, indented: boolean) => {
    const inv = invoiceById.get(cn.invoice_id);
    const invCode = inv ? formatInvoiceNumber(inv.invoice_number) : "—";
    return (
      <li
        key={`cn-${cn.id}`}
        className={`rounded-xl border border-border/80 bg-card/70 px-3.5 py-2.5 lg:py-2 lg:grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,1.9fr)_auto_5.5rem_auto] lg:items-center lg:gap-x-4 ${indented ? "ml-4 sm:ml-6" : ""}`}
      >
        <div className="flex items-center gap-2 lg:contents">
          <div className="font-semibold truncate min-w-0 flex-1 flex items-center gap-1.5 lg:col-start-1 lg:row-start-1">
            <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold bg-rose-500/15 text-rose-300 shrink-0">CN</span>
            <span className="font-mono text-xs sm:text-sm truncate">{indented ? cn.credit_number : (cn.client_name || cn.credit_number)}</span>
          </div>
          <span className={`lg:col-start-4 lg:row-start-1 shrink-0 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${cn.status === "Sent" ? "bg-emerald-500/15 text-emerald-400" : "bg-muted text-muted-foreground"}`}>
            {cn.status === "Sent" ? "Verstuurd" : "Concept"}
          </span>
          <div className="lg:col-start-5 lg:row-start-1 lg:w-auto shrink-0 text-sm sm:text-base font-bold tabular-nums text-rose-400 text-right">
            {formatEURCents(-Math.abs(Number(cn.amount || 0)))}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 mt-1 lg:mt-0 lg:contents">
          <div className="text-xs text-muted-foreground truncate lg:col-start-2 lg:row-start-1">
            {indented ? `${formatDate(cn.date)} · factuur ${invCode}` : <><span className="font-mono">{cn.credit_number}</span> · {formatDate(cn.date)} · factuur {invCode}</>}
          </div>
          <div className="flex shrink-0 -mr-2.5 lg:col-start-6 lg:row-start-1 lg:justify-end">
            {isAdmin && cn.status === "Draft" && (
              <Button size="icon" variant="ghost" className="hit h-9 w-9" onClick={() => sendCreditEmail(cn)} title="Verstuur creditnota" aria-label="Verstuur creditnota">
                <Send className="w-3.5 h-3.5 text-sky-400" />
              </Button>
            )}
            <Button size="icon" variant="ghost" className="hit h-9 w-9" onClick={() => downloadCreditPdf(cn)} title="Download creditnota PDF" aria-label="Download creditnota PDF">
              <Download className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
        {(cn.sent_at || cn.delivered_at) && (
          <div className="mt-1 lg:mt-0 lg:col-start-3 lg:row-start-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground min-w-0">
            {cn.sent_at && (
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Verstuurd {formatDate(cn.sent_at)}
              </span>
            )}
            {cn.delivered_at && (
              <span className="inline-flex items-center gap-1 text-emerald-400">
                ✓ Afgeleverd {formatDate(cn.delivered_at)}
              </span>
            )}
          </div>
        )}
      </li>
    );
  };

  const renderRow = (r: Row, inGroup: boolean) => {
    const credited = creditedTotalFor(r.id);
    const badge = creditBadgeKind(Number(r.total || 0), credited);
    const childCredits = inGroup ? (creditsByInvoice.get(r.id) ?? []) : [];
    const showMeta =
      r.sent_at ||
      (r.reminder_count ?? 0) > 0 ||
      r.email_status ||
      isPlanned(r) ||
      r.schedule_error ||
      (!r.repeat_monthly && r.repeat_stopped_at) ||
      badge !== "none";
    return (
      <div key={r.id} className="space-y-1.5">
        <li className="rounded-xl border border-border bg-card px-3.5 py-3 lg:py-2 lg:grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,1.9fr)_auto_5.5rem_auto] lg:items-center lg:gap-x-4">
      <div className="flex items-center gap-2 lg:contents">
        <div className="font-semibold truncate min-w-0 flex-1 lg:col-start-1 lg:row-start-1">{inGroup ? <span className="font-mono text-sm">{formatInvoiceNumber(r.invoice_number)}</span> : r.client_name}</div>
        {isAdmin ? (
          <select
            value={r.status}
            onChange={(e) => markStatus(r, e.target.value)}
            aria-label="Status" className={`lg:col-start-4 lg:row-start-1 shrink-0 rounded-full px-2.5 h-8 text-xs font-medium border-0 ${statusColor[r.status] ?? "bg-muted"}`}
          >
            {["Draft", "Sent", "Paid"].map((s) => <option key={s} value={s} className="bg-card text-foreground">{s}</option>)}
          </select>
        ) : (
          <span className={`lg:col-start-4 lg:row-start-1 shrink-0 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${statusColor[r.status] ?? "bg-muted"}`}>{r.status}</span>
        )}
        <div className="lg:col-start-5 lg:row-start-1 lg:w-auto shrink-0 text-base font-bold tabular-nums w-[4.5rem] text-right">{formatCurrency(Number(r.total || 0))}</div>
      </div>
      <div className="flex items-center justify-between gap-2 mt-1 lg:mt-0 lg:contents">
        <div className="text-xs text-muted-foreground truncate lg:col-start-2 lg:row-start-1">
          {inGroup ? formatDate(r.date) : <><span className="font-mono">{formatInvoiceNumber(r.invoice_number)}</span> · {formatDate(r.date)}</>}
        </div>
        <div className="flex shrink-0 -mr-2.5 lg:col-start-6 lg:row-start-1 lg:justify-end">
          {isAdmin && r.status !== "Paid" && (
            <Button size="icon" variant="ghost" className="hit h-9 w-9" onClick={() => sendInvoiceEmail(r)} title={r.sent_at ? "Opnieuw versturen" : "Verstuur factuur per e-mail"} aria-label={r.sent_at ? "Opnieuw versturen" : "Verstuur factuur"}>
              <Send className="w-3.5 h-3.5 text-sky-400" />
            </Button>
          )}
          {isAdmin && r.repeat_monthly && (
            <Button size="icon" variant="ghost" className="hit h-9 w-9" onClick={() => setStopTarget(r)} title="Stop herhaling" aria-label="Stop herhaling">
              <RepeatOffIcon className="w-3.5 h-3.5 text-violet-400" />
            </Button>
          )}
          {isAdmin && (r.status === "Sent" || r.status === "Paid") && (
            <Button size="icon" variant="ghost" className="hit h-9 w-9" onClick={() => setCreditTarget(r)} title="Creditnota" aria-label="Creditnota">
              <FileMinus2 className="w-3.5 h-3.5 text-rose-400" />
            </Button>
          )}
          <Button size="icon" variant="ghost" className="hit h-9 w-9" onClick={() => downloadPdf(r)} title="Download PDF" aria-label="Download PDF">
            <Download className="w-3.5 h-3.5" />
          </Button>
          {isAdmin && (
            <Button size="icon" variant="ghost" className="hit h-9 w-9" onClick={() => { setEditing(r); setModalOpen(true); }} title="Edit" aria-label="Bewerken">
              <Pencil className="w-3.5 h-3.5" />
            </Button>
          )}
          {isAdmin && (
            <Button size="icon" variant="ghost" className="hit h-9 w-9" onClick={() => deleteInvoiceRow(r)} title="Delete" aria-label="Verwijderen">
              <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
            </Button>
          )}
        </div>
      </div>
      {showMeta && (
        <div className="mt-1 lg:mt-0 lg:col-start-3 lg:row-start-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground min-w-0">
          {badge !== "none" && (
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-rose-500/15 text-rose-300">
              {badge === "full" ? "Gecrediteerd" : "Deels gecrediteerd"}
            </span>
          )}
          {r.status === "Draft" && r.scheduled_send_at && (
            <span className="inline-flex items-center gap-1 text-sky-400">
              <CalendarClock className="w-3.5 h-3.5" /> Gepland {formatDate(r.scheduled_send_at)} {hourLabel(r.scheduled_send_hour)}
            </span>
          )}
          {r.repeat_monthly && (
            <span className="inline-flex items-center gap-1 text-violet-400">
              <Repeat className="w-3.5 h-3.5" /> Maandelijks
              {r.status === "Draft" && r.scheduled_send_at ? "" : r.next_repeat_on ? ` · volgende ${formatDate(r.next_repeat_on)} ${hourLabel(r.repeat_hour)}` : r.repeat_day ? ` · dag ${r.repeat_day}, ${hourLabel(r.repeat_hour)}` : ""}
            </span>
          )}
          {!r.repeat_monthly && r.repeat_stopped_at && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <RepeatOffIcon className="w-3.5 h-3.5" /> Herhaling gestopt
            </span>
          )}
          {r.schedule_error && (
            <span className="inline-flex items-center gap-1 text-red-400" title={r.schedule_error}>
              ⚠ Automatisch versturen mislukt
            </span>
          )}
          {r.sent_at && (
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              Verstuurd {formatDate(r.sent_at)}
            </span>
          )}
          {r.delivered_at && (
            <span className="inline-flex items-center gap-1 text-emerald-400">
              ✓ Afgeleverd {formatDate(r.delivered_at)}
            </span>
          )}
          {r.opened_at && (
            <span className="inline-flex items-center gap-1 text-sky-400">
              👁 Geopend {formatDate(r.opened_at)}
            </span>
          )}
          {r.bounced_at && (
            <span className="inline-flex items-center gap-1 text-red-400">
              ⚠ Bounced {formatDate(r.bounced_at)}
            </span>
          )}
          {(r.reminder_count ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1">
              <Bell className="w-3.5 h-3.5 text-amber-400" />
              {r.reminder_count} herinnering{(r.reminder_count ?? 0) > 1 ? "en" : ""}
              {r.last_reminder_at && ` · laatst ${formatDate(r.last_reminder_at)}`}
            </span>
          )}
        </div>
      )}
        </li>
        {childCredits.length > 0 && (
          <ul className="space-y-1.5">{childCredits.map((cn) => renderCreditNoteRow(cn, true))}</ul>
        )}
      </div>
    );
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl 3xl:max-w-[1800px] 4xl:max-w-[2300px] mx-auto pb-24">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 mb-3">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight truncate">Invoices</h1>
        {isAdmin && (
          <Button onClick={() => { setEditing(null); setModalOpen(true); }} className="gap-2 shrink-0 bg-white text-black hover:bg-white/90 rounded-full h-10 px-4">
            <Plus className="w-4 h-4" /> New Invoice
          </Button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <Stat label="Paid" value={formatCurrency(totals.paid)} className="tone tone-emerald" ink="ink-emerald" />
        <Stat label="Outstanding" value={formatCurrency(totals.sent)} className={totals.sent > 0 ? "tone tone-amber" : ""} />
        <Stat label="Scheduled · 6 mnd" value={formatCurrency(forecast.total)} sub={`${forecast.count} ${forecast.count === 1 ? "factuur" : "facturen"} t/m ${formatDate(forecast.until)}`} className={forecast.count > 0 ? "tone tone-sky" : ""} />
      </div>

      <div className="space-y-2 mb-3">
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="w-full flex overflow-x-auto sm:grid sm:grid-cols-6">
            {(["All", "Draft", "Gepland", "Sent", "Paid", "Creditnota's"] as const).map((t) => (
              <TabsTrigger key={t} value={t} className="text-xs shrink-0 flex-1">
                {t} <span className="ml-1 opacity-60">{counts[t]}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="w-full h-9" />
          <div className="shrink-0 inline-flex rounded-lg border border-border p-0.5 h-9" role="group" aria-label="Weergave">
            {([["clients", "Per klant"], ["list", "Lijst"]] as const).map(([v, label]) => (
              <button key={v} type="button" onClick={() => setViewMode(v)} aria-pressed={view === v}
                className={`px-3 rounded-md text-xs font-medium ${view === v ? "bg-white text-black" : "text-muted-foreground"}`}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
      ) : tab === "Creditnota's" ? (
        filteredCreditNotes.length === 0 ? (
          <EmptyState icon={FileMinus2} title="Geen creditnota's" description="Maak een creditnota aan vanuit een verstuurde of betaalde factuur." />
        ) : (
          <ul className="space-y-2">{filteredCreditNotes.map((cn) => renderCreditNoteRow(cn, false))}</ul>
        )
      ) : filtered.length === 0 ? (
        <EmptyState icon={FileText} title="No invoices" description="Create one to get started." />
      ) : (
        view === "list" ? (
          <ul className="space-y-2">{filtered.map((r) => renderRow(r, false))}</ul>
        ) : (
          <ul className="space-y-2 3xl:space-y-0 3xl:grid 3xl:grid-cols-2 3xl:gap-3 3xl:items-start">
            {groups.map((g) => {
              const open = q.trim() !== "" || groups.length === 1 || expanded.has(g.key);
              return (
                <li key={g.key} className={`rounded-2xl border bg-card/60 ${g.open > 0 ? "border-amber-500/30" : "border-border"}`}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(g.key)}
                    aria-expanded={open}
                    className="press w-full flex items-center gap-3 px-3.5 py-3 text-left"
                  >
                    <ChevronRight className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold truncate flex items-center gap-2">{colorOf[g.key] && <span className="w-1.5 h-4 rounded-full shrink-0" style={{ backgroundColor: colorOf[g.key] }} aria-hidden />}<span className="truncate">{g.name}</span></div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground tabular-nums">
                        <span>{g.items.length} {g.items.length === 1 ? "factuur" : "facturen"}</span>
                        {g.paid > 0 && <span className="text-emerald-400">{formatCurrency(g.paid)} betaald</span>}
                        {g.open > 0 && <span className="text-amber-400">{formatCurrency(g.open)} open</span>}
                        {g.planned > 0 && (
                          <span className="text-sky-400">
                            {g.planned} gepland{g.nextPlanned ? ` · volgende ${formatDate(g.nextPlanned)}` : ""}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-bold tabular-nums">{formatCurrency(g.total)}</div>
                      <div className="text-[11px] text-muted-foreground">totaal</div>
                    </div>
                  </button>
                  {open && (
                    <ul className="space-y-2 px-2 pb-2 pop-in">{g.items.map((r) => renderRow(r, true))}</ul>
                  )}
                </li>
              );
            })}
          </ul>
        )
      )}

      <InvoiceModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        initial={editing ?? undefined}
        clients={clients}
        onSaved={() => load()}
      />
      <StopRepeatDialog
        invoice={stopTarget}
        onClose={() => setStopTarget(null)}
        onStopped={() => load()}
      />
      <CreditNoteDialog
        invoice={creditTarget}
        hasEmail={!!clients.find((c) => c.id === creditTarget?.client)?.contact_email?.trim()}
        onClose={() => setCreditTarget(null)}
        onCreated={() => load()}
      />
    </div>
  );
}

function Stat({ label, value, sub, className = "", ink = "" }: { label: string; value: string; sub?: string; className?: string; ink?: string }) {
  return (
    <div className={`rounded-xl border bg-card px-3 py-2.5 ${className || "border-border"}`}>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-lg font-bold tabular-nums ${ink}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground tabular-nums">{sub}</div>}
    </div>
  );
}
