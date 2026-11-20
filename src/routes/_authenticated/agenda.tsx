import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Ban,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleSlash,
  Copy,
  GripVertical,
  Mail,
  MapPin,
  MoveRight,
  Paperclip,
  Phone,
  RotateCcw,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  KIND_COLOR,
  OUTCOME_LABEL,
  dayOf,
  kindOf,
  moveItem,
  perDay,
  timeOf,
  weekOf,
  type AgendaItem,
  type AgendaKind,
  type Outcome,
} from "@/lib/agenda";
import { changeBooking } from "@/lib/agenda.functions";

export const Route = createFileRoute("/_authenticated/agenda")({ component: AgendaPage });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
// the link clients get: the booking page on the company website
const BOOK_URL = "https://solynglobal.be/afspraak";
const FILTERS: [AgendaKind | "all", string][] = [
  ["all", "Alles"],
  ["booking", "Afspraken"],
  ["block", "Werkblokken"],
  ["pathe", "Pathé"],
];
// soft hyphen so "Geannuleerd" can break in a narrow day column
const BUTTON_LABEL: Record<Outcome, string> = { done: "Gedaan", missed: "Niet gedaan", cancelled: "Geannu\u00ADleerd" };
const LENGTHS = [30, 45, 60, 90, 120, 180, 240];
const dayLabel = (d: string) =>
  new Intl.DateTimeFormat("nl-BE", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${d}T12:00:00Z`));
const minutesOf = (i: { start: string; end: string }) =>
  Math.round((Date.parse(i.end) - Date.parse(i.start)) / 60000);

type BookingStep = { item: AgendaItem; action: "move" | "cancel"; start?: string; end?: string };

/** Meetings, bookings, work blocks and Pathé shifts, week by week, in each client's colour. Each item can be marked done, cancelled or moved. */
function AgendaPage() {
  const [items, setItems] = useState<AgendaItem[] | null>(null);
  const [synced, setSynced] = useState<string | null>(null);
  const [shift, setShift] = useState(0);
  const [filter, setFilter] = useState<AgendaKind | "all">("all");
  const [open, setOpen] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropDay, setDropDay] = useState<string | null>(null);
  const [step, setStep] = useState<BookingStep | null>(null);
  const today = dayOf(new Date().toISOString());

  const load = useCallback(async () => {
    const [cal, book, cli] = await Promise.all([
      db
        .from("calendar_busy")
        .select(
          "id, starts_at, ends_at, title, kind, client_id, source, synced_at, outcome, moved_from",
        )
        .neq("source", "no-roster")
        .order("starts_at")
        .limit(2000),
      db
        .from("bookings")
        .select(
          "id, client_id, name, email, phone, company, note, starts_at, ends_at, mode, location, attachments, topics, status, outcome, moved_from",
        )
        .in("status", ["confirmed", "cancelled"])
        .order("starts_at")
        .limit(500),
      db.from("clients").select("id, brand_color"),
    ]);
    const color: Record<string, string | null> = Object.fromEntries(
      (cli.data ?? []).map((c: { id: string; brand_color: string | null }) => [
        c.id,
        c.brand_color,
      ]),
    );
    const fromCal: AgendaItem[] = (cal.data ?? []).map(
      (r: {
        id: string;
        starts_at: string;
        ends_at: string;
        title: string | null;
        kind: string | null;
        client_id: string | null;
        outcome: Outcome | null;
        moved_from: string | null;
      }) => {
        const title = r.title || "Bezet",
          kind = (r.kind && r.kind !== "other" ? r.kind : kindOf(title)) as AgendaKind;
        return {
          id: r.id,
          src: "cal" as const,
          start: r.starts_at,
          end: r.ends_at,
          title,
          kind,
          clientId: r.client_id,
          color: (r.client_id && color[r.client_id]) || KIND_COLOR[kind],
          outcome: r.outcome,
          movedFrom: r.moved_from,
        };
      },
    );
    const fromBook: AgendaItem[] = (book.data ?? []).map(
      (b: {
        id: string;
        client_id: string | null;
        name: string;
        email: string;
        phone: string | null;
        company: string | null;
        note: string | null;
        starts_at: string;
        ends_at: string;
        mode: "online" | "onsite" | null;
        location: string | null;
        attachments: { name: string; path: string }[] | null;
        topics: string[] | null;
        status: string;
        outcome: "done" | "missed" | null;
        moved_from: string | null;
      }) => ({
        id: b.id,
        src: "booking" as const,
        start: b.starts_at,
        end: b.ends_at,
        title: `${b.name}${b.company ? ` · ${b.company}` : ""}`,
        kind: "booking" as const,
        clientId: b.client_id,
        color: (b.client_id && color[b.client_id]) || KIND_COLOR.booking,
        outcome: b.status === "cancelled" ? "cancelled" : b.outcome,
        movedFrom: b.moved_from,
        contact: {
          email: b.email,
          phone: b.phone,
          company: b.company,
          note: b.note,
          mode: b.mode === "onsite" ? "onsite" : "online",
          location: b.location,
          topics: Array.isArray(b.topics) ? b.topics : [],
          files: Array.isArray(b.attachments) ? b.attachments : [],
        },
      }),
    );
    setSynced(
      ((cal.data ?? []) as { synced_at: string }[])
        .map((r) => r.synced_at)
        .sort()
        .pop() ?? null,
    );
    setItems([...fromCal, ...fromBook]);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const days = useMemo(() => weekOf(today, shift), [today, shift]);
  const shown = useMemo(
    () =>
      (items ?? []).filter(
        (i) =>
          filter === "all" || i.kind === filter || (filter === "booking" && i.kind === "meeting"),
      ),
    [items, filter],
  );
  const grid = useMemo(() => perDay(shown, days), [shown, days]);
  const upcoming = (items ?? []).filter(
    (i) => i.kind === "booking" && i.outcome !== "cancelled" && i.start > new Date().toISOString(),
  ).length;

  const local = (id: string, change: Partial<AgendaItem>) =>
    setItems((xs) => (xs ?? []).map((x) => (x.id === id ? { ...x, ...change } : x)));

  /** Calendar rows (work blocks, Pathé, meetings): saved straight away, with an undo. */
  const saveCal = async (
    i: AgendaItem,
    change: { outcome?: Outcome | null; start?: string; end?: string },
    label: string,
  ) => {
    const before = {
      outcome: i.outcome ?? null,
      start: i.start,
      end: i.end,
      movedFrom: i.movedFrom ?? null,
    };
    const moved = change.start && change.start !== i.start;
    const row: Record<string, string | null> = { edited_at: new Date().toISOString() };
    if ("outcome" in change) row.outcome = change.outcome ?? null;
    if (moved)
      Object.assign(row, {
        starts_at: change.start,
        ends_at: change.end,
        moved_from: i.movedFrom ?? i.start,
      });
    local(i.id, {
      ...("outcome" in change ? { outcome: change.outcome } : {}),
      ...(moved
        ? { start: change.start!, end: change.end!, movedFrom: i.movedFrom ?? i.start }
        : {}),
    });
    const { error } = await db.from("calendar_busy").update(row).eq("id", i.id);
    if (error) {
      toast.error(`Opslaan lukte niet: ${error.message}`);
      void load();
      return;
    }
    toast.success(label, {
      action: {
        label: "Ongedaan maken",
        onClick: async () => {
          local(i.id, {
            outcome: before.outcome,
            start: before.start,
            end: before.end,
            movedFrom: before.movedFrom,
          });
          await db
            .from("calendar_busy")
            .update({
              outcome: before.outcome,
              starts_at: before.start,
              ends_at: before.end,
              moved_from: before.movedFrom,
              edited_at: new Date().toISOString(),
            })
            .eq("id", i.id);
        },
      },
    });
  };
  /** Bookings: done / not done saves straight away; moving and cancelling ask whether to mail the client. */
  const setBookingOutcome = async (i: AgendaItem, outcome: "done" | "missed" | null) => {
    local(i.id, { outcome });
    const { error } = await db.from("bookings").update({ outcome }).eq("id", i.id);
    if (error) {
      toast.error(error.message);
      void load();
    } else toast.success(outcome ? OUTCOME_LABEL[outcome] : "Status gewist");
  };
  const mark = (i: AgendaItem, o: Outcome) => {
    const next = i.outcome === o ? null : o;
    if (i.src === "booking") {
      if (o === "cancelled")
        return next ? setStep({ item: i, action: "cancel" }) : void restoreBooking(i);
      return void setBookingOutcome(i, next as "done" | "missed" | null);
    }
    void saveCal(i, { outcome: next }, next ? OUTCOME_LABEL[next] : "Status gewist");
  };
  const move = (i: AgendaItem, day: string, time?: string, minutes?: number) => {
    const to = moveItem(i, day, time, minutes);
    if (to.start === i.start && to.end === i.end) return;
    if (i.src === "booking") return setStep({ item: i, action: "move", ...to });
    void saveCal(i, to, `Verplaatst naar ${dayLabel(day)} ${timeOf(to.start)}`);
  };
  const run = useServerFn(changeBooking);
  const restoreBooking = async (i: AgendaItem) => {
    try {
      await run({ data: { id: i.id, action: "restore", mail: false } });
      local(i.id, { outcome: null });
      toast.success("Afspraak staat weer gepland");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Dat lukte niet");
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(BOOK_URL);
      toast.success("Boekingslink gekopieerd");
    } catch {
      toast(BOOK_URL);
    }
  };
  // files are private: a link that works for a few minutes is made when asked
  const openFile = async (path: string) => {
    const { data, error } = await supabase.storage.from("booking-files").createSignedUrl(path, 300);
    if (error || !data?.signedUrl) toast.error("Bestand openen lukte niet");
    else window.open(data.signedUrl, "_blank", "noopener");
  };

  return (
    <div className="p-4 md:p-6 max-w-[1700px] mx-auto pb-28 lg:pb-8">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold flex items-center gap-2 mr-auto">
          <CalendarDays className="w-6 h-6" /> Agenda
        </h1>
        <button
          type="button"
          onClick={copy}
          className="press h-10 px-4 rounded-full bg-white text-black text-sm font-semibold inline-flex items-center gap-2"
        >
          <Copy className="w-4 h-4" /> Boekingslink kopiëren
        </button>
      </div>
      <p className="text-sm text-muted-foreground mt-1">
        {upcoming} {upcoming === 1 ? "geboekte afspraak" : "geboekte afspraken"} gepland. Tik op een
        blok om het af te vinken, te annuleren of te verplaatsen
        <span className="hidden md:inline">, of sleep het naar een andere dag</span>.
        {synced
          ? ` Google Agenda laatst overgenomen op ${dayLabel(dayOf(synced))} om ${timeOf(synced)}.`
          : ""}
      </p>

      <div className="flex flex-wrap items-center gap-2 mt-4">
        <div className="inline-flex items-center rounded-full border border-border p-0.5">
          <button
            type="button"
            onClick={() => setShift((s) => s - 1)}
            aria-label="Vorige week"
            className="press w-9 h-9 grid place-items-center rounded-full"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setShift(0)}
            className="press h-9 px-3 text-sm font-medium"
          >
            {shift === 0 ? "Deze week" : `${dayLabel(days[0])} – ${dayLabel(days[6])}`}
          </button>
          <button
            type="button"
            onClick={() => setShift((s) => s + 1)}
            aria-label="Volgende week"
            className="press w-9 h-9 grid place-items-center rounded-full"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div
          role="group"
          aria-label="Toon"
          className="inline-flex rounded-full border border-border p-0.5 text-sm"
        >
          {FILTERS.map(([k, l]) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              aria-pressed={filter === k}
              className={`press h-9 px-3 rounded-full ${filter === k ? "bg-white text-black font-semibold" : "text-muted-foreground"}`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {items === null ? (
        <p className="text-sm text-muted-foreground mt-6">Agenda laden…</p>
      ) : (
        <div className="mt-4 grid gap-2 md:grid-cols-7">
          {days.map((d) => {
            const list = grid[d] ?? [],
              isToday = d === today,
              target = dropDay === d && dragId;
            return (
              <section
                key={d}
                aria-label={dayLabel(d)}
                onDragOver={(e) => {
                  if (dragId) {
                    e.preventDefault();
                    setDropDay(d);
                  }
                }}
                onDragLeave={() => setDropDay((x) => (x === d ? null : x))}
                onDrop={(e) => {
                  e.preventDefault();
                  const it = (items ?? []).find((x) => x.id === dragId);
                  setDragId(null);
                  setDropDay(null);
                  if (it) move(it, d);
                }}
                className={`rounded-2xl border p-2.5 min-w-0 transition-colors ${target ? "border-white/60 bg-white/[0.06]" : isToday ? "border-[#C9A14A]/60 bg-[#C9A14A]/[0.05]" : "border-border bg-card"} ${list.length === 0 && !dragId ? "hidden md:block" : ""}`}
              >
                <h2
                  className={`text-xs font-semibold capitalize mb-2 ${isToday ? "text-[#C9A14A]" : "text-muted-foreground"}`}
                >
                  {dayLabel(d)}
                  {isToday ? " · vandaag" : ""}
                </h2>
                {list.length === 0 ? (
                  <p className="text-xs text-muted-foreground/60">
                    {target ? "Hierheen verplaatsen" : "Niets gepland"}
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {list.map((i) => {
                      const expanded = open === i.id,
                        quiet = i.kind === "pathe",
                        off = i.outcome === "cancelled";
                      return (
                        <li
                          key={i.id}
                          draggable
                          onDragStart={(e) => {
                            setDragId(i.id);
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragEnd={() => {
                            setDragId(null);
                            setDropDay(null);
                          }}
                          className={dragId === i.id ? "opacity-40" : ""}
                        >
                          <button
                            type="button"
                            onClick={() => setOpen(expanded ? null : i.id)}
                            aria-expanded={expanded}
                            className={`group w-full text-left rounded-xl px-2.5 py-2 min-h-11 press ${off ? "opacity-55" : ""}`}
                            style={{
                              background: `${i.color}${quiet || off ? "12" : "26"}`,
                              boxShadow: `inset 3px 0 0 ${off ? "#6B7280" : i.color}`,
                            }}
                          >
                            <span className="flex items-center gap-1 text-[11px] tabular-nums text-muted-foreground">
                              <span className="min-w-0 truncate">
                                {timeOf(i.start)} – {timeOf(i.end)}
                                {i.kind === "booking"
                                  ? ` · ${i.contact?.mode === "onsite" ? "ter plaatse" : "online"}`
                                  : ""}
                              </span>
                              <GripVertical
                                className="w-3 h-3 ml-auto shrink-0 opacity-0 md:group-hover:opacity-60"
                                aria-hidden
                              />
                            </span>
                            <span
                              className={`block text-sm font-medium leading-snug break-words ${off ? "line-through" : ""}`}
                            >
                              {i.title}
                            </span>
                            {(i.outcome || i.movedFrom) && (
                              <span className="mt-1 flex flex-wrap gap-1">
                                {i.outcome && <OutcomeChip o={i.outcome} />}
                                {i.movedFrom && !off && (
                                  <span className="text-[10px] rounded-full bg-white/10 px-1.5 py-px text-muted-foreground">
                                    verplaatst
                                  </span>
                                )}
                              </span>
                            )}
                          </button>
                          {expanded && (
                            <ItemPanel
                              item={i}
                              onMark={(o) => mark(i, o)}
                              onMove={(day, time, len) => move(i, day, time, len)}
                              onFile={openFile}
                            />
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
          {days.every((d) => (grid[d] ?? []).length === 0) && (
            <p className="md:hidden text-sm text-muted-foreground">Niets gepland deze week.</p>
          )}
        </div>
      )}

      {step && (
        <BookingDialog
          step={step}
          onClose={() => setStep(null)}
          onDone={(change) => {
            local(step.item.id, change);
            setStep(null);
          }}
        />
      )}
    </div>
  );
}

function OutcomeChip({ o }: { o: Outcome }) {
  const tone =
    o === "done"
      ? "bg-emerald-500/20 text-emerald-300"
      : o === "missed"
        ? "bg-amber-500/20 text-amber-300"
        : "bg-white/10 text-muted-foreground";
  const I = o === "done" ? Check : o === "missed" ? CircleSlash : Ban;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] rounded-full px-1.5 py-px ${tone}`}
    >
      <I className="w-2.5 h-2.5" />
      {OUTCOME_LABEL[o]}
    </span>
  );
}

/** Under a tapped item: done / not done / cancelled, move to another moment, and the booking's details. */
function ItemPanel({
  item: i,
  onMark,
  onMove,
  onFile,
}: {
  item: AgendaItem;
  onMark: (o: Outcome) => void;
  onMove: (day: string, time: string, minutes: number) => void;
  onFile: (p: string) => void;
}) {
  const [day, setDay] = useState(dayOf(i.start));
  const [time, setTime] = useState(timeOf(i.start));
  const [len, setLen] = useState(minutesOf(i));
  const lengths = LENGTHS.includes(len) ? LENGTHS : [...LENGTHS, len].sort((a, b) => a - b);
  const changed = day !== dayOf(i.start) || time !== timeOf(i.start) || len !== minutesOf(i);
  const btn = (o: Outcome, I: typeof Check, tone: string) => (
    <button
      type="button"
      onClick={() => onMark(o)}
      aria-pressed={i.outcome === o}
      className={`press h-12 flex-1 min-w-0 rounded-xl border px-1 text-[10px] leading-tight flex flex-col items-center justify-center gap-0.5 ${i.outcome === o ? tone : "border-border text-muted-foreground hover:text-foreground"}`}
    >
      <I className="w-3.5 h-3.5 shrink-0" />
      <span className="max-w-full text-center break-words">{BUTTON_LABEL[o]}</span>
    </button>
  );
  return (
    <div className="rounded-xl border border-border mt-1 p-2.5 text-sm space-y-2.5">
      <div className="flex gap-1" role="group" aria-label="Hoe ging het">
        {btn("done", Check, "border-emerald-500/60 bg-emerald-500/15 text-emerald-300")}
        {btn("missed", CircleSlash, "border-amber-500/60 bg-amber-500/15 text-amber-300")}
        {btn("cancelled", Ban, "border-white/40 bg-white/10 text-foreground")}
      </div>

      <div className="space-y-1.5">
        <div className="text-xs font-medium text-muted-foreground flex items-center gap-1">
          <MoveRight className="w-3.5 h-3.5" />
          Verplaatsen
        </div>
        <div className="grid gap-1.5">
          <input
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            aria-label="Dag"
            className="h-9 min-w-0 rounded-lg border border-border bg-background px-2 text-sm"
          />
          <input
            type="time"
            value={time}
            step={900}
            onChange={(e) => setTime(e.target.value)}
            aria-label="Begin"
            className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
          />
        </div>
        <div className="flex gap-1.5">
          <select
            value={len}
            onChange={(e) => setLen(Number(e.target.value))}
            aria-label="Duur"
            className="h-9 flex-1 min-w-0 rounded-lg border border-border bg-background px-2 text-sm"
          >
            {lengths.map((m) => (
              <option key={m} value={m}>
                {m < 60 ? `${m} min` : `${Math.floor(m / 60)} u${m % 60 ? ` ${m % 60}` : ""}`}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!changed || !day || !time}
            onClick={() => onMove(day, time, len)}
            className="press h-9 rounded-full bg-white text-black px-3 text-xs font-semibold disabled:opacity-40"
          >
            Verplaats
          </button>
        </div>
        {i.movedFrom && (
          <p className="text-[11px] text-muted-foreground">
            Oorspronkelijk {dayLabel(dayOf(i.movedFrom))} om {timeOf(i.movedFrom)}
          </p>
        )}
      </div>

      {i.contact && (
        <div className="space-y-1.5 border-t border-border pt-2">
          {i.contact.mode === "onsite" ? (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(i.contact.location ?? "")}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-start gap-2"
            >
              <MapPin className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Ter plaatse: {i.contact.location}</span>
            </a>
          ) : (
            <p className="flex items-center gap-2">
              <Video className="w-4 h-4 shrink-0" />
              Online meeting
            </p>
          )}
          <a href={`mailto:${i.contact.email}`} className="flex items-center gap-2 break-all">
            <Mail className="w-4 h-4 shrink-0" />
            {i.contact.email}
          </a>
          {i.contact.phone && (
            <a href={`tel:${i.contact.phone}`} className="flex items-center gap-2">
              <Phone className="w-4 h-4 shrink-0" />
              {i.contact.phone}
            </a>
          )}
          {i.contact.topics.length > 0 && (
            <p className="flex flex-wrap gap-1">
              {i.contact.topics.map((t) => (
                <span key={t} className="text-[11px] rounded-full border border-border px-2 py-0.5">
                  {t}
                </span>
              ))}
            </p>
          )}
          {i.contact.note && (
            <p className="text-muted-foreground whitespace-pre-wrap">{i.contact.note}</p>
          )}
          {i.contact.files.map((f) => (
            <button
              key={f.path}
              type="button"
              onClick={() => onFile(f.path)}
              className="press flex items-center gap-2 text-left underline-offset-2 hover:underline min-h-9 break-all"
            >
              <Paperclip className="w-4 h-4 shrink-0" />
              {f.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Moving or cancelling a client's appointment: say whether they get a mail about it. */
function BookingDialog({
  step,
  onClose,
  onDone,
}: {
  step: BookingStep;
  onClose: () => void;
  onDone: (change: Partial<AgendaItem>) => void;
}) {
  const run = useServerFn(changeBooking);
  const to = step.item.contact?.email ?? "";
  const [mail, setMail] = useState(!!to);
  const [busy, setBusy] = useState(false);
  const moving = step.action === "move";
  const go = async () => {
    setBusy(true);
    try {
      const res = await run({
        data: { id: step.item.id, action: step.action, start: step.start, end: step.end, mail },
      });
      onDone(
        moving
          ? {
              start: step.start!,
              end: step.end!,
              movedFrom: step.item.movedFrom ?? step.item.start,
              outcome: null,
            }
          : { outcome: "cancelled" },
      );
      const what = moving
        ? `Verplaatst naar ${dayLabel(dayOf(step.start!))} ${timeOf(step.start!)}`
        : "Afspraak geannuleerd";
      toast.success(what, {
        description: res.mailed
          ? `Klant gemaild (${to})`
          : mail
            ? `Geen mail: ${res.reason}`
            : "Klant niet gemaild",
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Dat lukte niet");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{moving ? "Afspraak verplaatsen" : "Afspraak annuleren"}</DialogTitle>
          <DialogDescription>
            {step.item.title} ·{" "}
            {moving ? (
              <>
                <span className="line-through">
                  {dayLabel(dayOf(step.item.start))} {timeOf(step.item.start)}
                </span>{" "}
                →{" "}
                <strong>
                  {dayLabel(dayOf(step.start!))} {timeOf(step.start!)}–{timeOf(step.end!)}
                </strong>
              </>
            ) : (
              `${dayLabel(dayOf(step.item.start))} ${timeOf(step.item.start)}`
            )}
          </DialogDescription>
        </DialogHeader>
        <label className="flex items-start justify-between gap-3 rounded-xl border border-border p-3">
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <Mail className="w-4 h-4" />
              Mail de klant
            </span>
            <span className="block text-xs text-muted-foreground mt-0.5">
              {to
                ? moving
                  ? `“Je afspraak is verplaatst”, met het nieuwe en het oude moment. Naar ${to}`
                  : `“Je afspraak is geannuleerd”, met een link om een nieuw moment te kiezen. Naar ${to}`
                : "Geen e-mailadres bij deze afspraak"}
            </span>
          </span>
          <Switch
            checked={mail}
            onCheckedChange={setMail}
            disabled={!to}
            aria-label="Mail de klant"
          />
        </label>
        <DialogFooter className="gap-2 sm:gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-10 rounded-full border border-border px-4 text-sm"
          >
            Terug
          </button>
          <button
            type="button"
            onClick={go}
            disabled={busy}
            className={`h-10 rounded-full px-5 text-sm font-semibold disabled:opacity-50 ${moving ? "bg-white text-black" : "bg-red-500 text-white"}`}
          >
            {busy
              ? "Bezig…"
              : moving
                ? mail
                  ? "Verplaats en mail"
                  : "Verplaats"
                : mail
                  ? "Annuleer en mail"
                  : "Annuleer"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
