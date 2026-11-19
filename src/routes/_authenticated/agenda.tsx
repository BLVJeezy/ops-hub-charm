import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Copy, Mail, Phone } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { KIND_COLOR, dayOf, kindOf, perDay, timeOf, weekOf, type AgendaItem, type AgendaKind } from "@/lib/agenda";

export const Route = createFileRoute("/_authenticated/agenda")({ component: AgendaPage });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const BOOK_PATH = "/afspraak";
const FILTERS: [AgendaKind | "all", string][] = [["all", "Alles"], ["booking", "Afspraken"], ["block", "Werkblokken"], ["pathe", "Pathé"]];
const dayLabel = (d: string) => new Intl.DateTimeFormat("nl-BE", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(new Date(`${d}T12:00:00Z`));

/** Meetings, bookings from the public page, work blocks and Pathé shifts, week by week, in each client's colour. */
function AgendaPage() {
  const [items, setItems] = useState<AgendaItem[] | null>(null);
  const [synced, setSynced] = useState<string | null>(null);
  const [shift, setShift] = useState(0);
  const [filter, setFilter] = useState<AgendaKind | "all">("all");
  const [open, setOpen] = useState<string | null>(null);
  const today = dayOf(new Date().toISOString());

  const load = useCallback(async () => {
    const [cal, book, cli] = await Promise.all([
      db.from("calendar_busy").select("id, starts_at, ends_at, title, kind, client_id, source, synced_at").neq("source", "no-roster").order("starts_at").limit(2000),
      db.from("bookings").select("id, name, email, phone, company, note, starts_at, ends_at").eq("status", "confirmed").order("starts_at").limit(500),
      db.from("clients").select("id, brand_color"),
    ]);
    const color: Record<string, string | null> = Object.fromEntries((cli.data ?? []).map((c: { id: string; brand_color: string | null }) => [c.id, c.brand_color]));
    const fromCal: AgendaItem[] = (cal.data ?? []).map((r: { id: string; starts_at: string; ends_at: string; title: string | null; kind: string | null; client_id: string | null }) => {
      const title = r.title || "Bezet", kind = ((r.kind && r.kind !== "other" ? r.kind : kindOf(title)) as AgendaKind);
      return { id: r.id, start: r.starts_at, end: r.ends_at, title, kind, clientId: r.client_id, color: (r.client_id && color[r.client_id]) || KIND_COLOR[kind] };
    });
    const fromBook: AgendaItem[] = (book.data ?? []).map((b: { id: string; name: string; email: string; phone: string | null; company: string | null; note: string | null; starts_at: string; ends_at: string }) => ({
      id: b.id, start: b.starts_at, end: b.ends_at, title: `${b.name}${b.company ? ` · ${b.company}` : ""}`, kind: "booking" as const, clientId: null, color: KIND_COLOR.booking,
      contact: { email: b.email, phone: b.phone, company: b.company, note: b.note },
    }));
    setSynced(((cal.data ?? []) as { synced_at: string }[]).map((r) => r.synced_at).sort().pop() ?? null);
    setItems([...fromCal, ...fromBook]);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const days = useMemo(() => weekOf(today, shift), [today, shift]);
  const shown = useMemo(() => (items ?? []).filter((i) => filter === "all" || i.kind === filter || (filter === "booking" && i.kind === "meeting")), [items, filter]);
  const grid = useMemo(() => perDay(shown, days), [shown, days]);
  const upcoming = (items ?? []).filter((i) => i.kind === "booking" && i.start > new Date().toISOString()).length;

  const copy = async () => {
    const url = `${window.location.origin}${BOOK_PATH}`;
    try { await navigator.clipboard.writeText(url); toast.success("Boekingslink gekopieerd"); } catch { toast(url); }
  };
  const cancel = async (i: AgendaItem) => {
    if (!window.confirm(`Afspraak met ${i.title} annuleren? De klant krijgt hiervan geen automatische mail.`)) return;
    const { error } = await db.from("bookings").update({ status: "cancelled" }).eq("id", i.id);
    if (error) toast.error("Annuleren lukte niet"); else { toast.success("Afspraak geannuleerd"); setOpen(null); void load(); }
  };

  return (
    <div className="p-4 md:p-6 max-w-[1700px] mx-auto pb-28 lg:pb-8">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold flex items-center gap-2 mr-auto"><CalendarDays className="w-6 h-6" /> Agenda</h1>
        <button type="button" onClick={copy} className="press h-10 px-4 rounded-full bg-white text-black text-sm font-semibold inline-flex items-center gap-2"><Copy className="w-4 h-4" /> Boekingslink kopiëren</button>
      </div>
      <p className="text-sm text-muted-foreground mt-1">
        {upcoming} {upcoming === 1 ? "geboekte afspraak" : "geboekte afspraken"} gepland.{synced ? ` Google Agenda laatst overgenomen op ${dayLabel(dayOf(synced))} om ${timeOf(synced)}.` : ""}
      </p>

      <div className="flex flex-wrap items-center gap-2 mt-4">
        <div className="inline-flex items-center rounded-full border border-border p-0.5">
          <button type="button" onClick={() => setShift((s) => s - 1)} aria-label="Vorige week" className="press w-9 h-9 grid place-items-center rounded-full"><ChevronLeft className="w-4 h-4" /></button>
          <button type="button" onClick={() => setShift(0)} className="press h-9 px-3 text-sm font-medium">{shift === 0 ? "Deze week" : `${dayLabel(days[0])} – ${dayLabel(days[6])}`}</button>
          <button type="button" onClick={() => setShift((s) => s + 1)} aria-label="Volgende week" className="press w-9 h-9 grid place-items-center rounded-full"><ChevronRight className="w-4 h-4" /></button>
        </div>
        <div role="group" aria-label="Toon" className="inline-flex rounded-full border border-border p-0.5 text-sm">
          {FILTERS.map(([k, l]) => <button key={k} type="button" onClick={() => setFilter(k)} aria-pressed={filter === k} className={`press h-9 px-3 rounded-full ${filter === k ? "bg-white text-black font-semibold" : "text-muted-foreground"}`}>{l}</button>)}
        </div>
      </div>

      {items === null ? <p className="text-sm text-muted-foreground mt-6">Agenda laden…</p> : (
        <div className="mt-4 grid gap-2 md:grid-cols-7">
          {days.map((d) => {
            const list = grid[d] ?? [], isToday = d === today;
            return (
              <section key={d} aria-label={dayLabel(d)} className={`rounded-2xl border p-2.5 min-w-0 ${isToday ? "border-[#C9A14A]/60 bg-[#C9A14A]/[0.05]" : "border-border bg-card"} ${list.length === 0 ? "hidden md:block" : ""}`}>
                <h2 className={`text-xs font-semibold capitalize mb-2 ${isToday ? "text-[#C9A14A]" : "text-muted-foreground"}`}>{dayLabel(d)}{isToday ? " · vandaag" : ""}</h2>
                {list.length === 0 ? <p className="text-xs text-muted-foreground/60">Niets gepland</p> : (
                  <ul className="space-y-1.5">
                    {list.map((i) => {
                      const expanded = open === i.id && !!i.contact, quiet = i.kind === "pathe";
                      return (
                        <li key={i.id}>
                          <button type="button" disabled={!i.contact} onClick={() => setOpen(expanded ? null : i.id)} aria-expanded={i.contact ? expanded : undefined}
                            className="w-full text-left rounded-xl px-2.5 py-2 min-h-11 enabled:press" style={{ background: `${i.color}${quiet ? "14" : "26"}`, boxShadow: `inset 3px 0 0 ${i.color}` }}>
                            <span className="block text-[11px] tabular-nums text-muted-foreground">{timeOf(i.start)} – {timeOf(i.end)}{i.kind === "booking" ? " · geboekt" : ""}</span>
                            <span className="block text-sm font-medium leading-snug break-words">{i.title}</span>
                          </button>
                          {expanded && i.contact && (
                            <div className="rounded-xl border border-border mt-1 p-2.5 text-sm space-y-1.5">
                              <a href={`mailto:${i.contact.email}`} className="flex items-center gap-2 break-all"><Mail className="w-4 h-4 shrink-0" />{i.contact.email}</a>
                              {i.contact.phone && <a href={`tel:${i.contact.phone}`} className="flex items-center gap-2"><Phone className="w-4 h-4 shrink-0" />{i.contact.phone}</a>}
                              {i.contact.note && <p className="text-muted-foreground whitespace-pre-wrap">{i.contact.note}</p>}
                              <button type="button" onClick={() => cancel(i)} className="press text-xs text-red-400 underline-offset-2 hover:underline min-h-9">Afspraak annuleren</button>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
          {days.every((d) => (grid[d] ?? []).length === 0) && <p className="md:hidden text-sm text-muted-foreground">Niets gepland deze week.</p>}
        </div>
      )}
    </div>
  );
}
