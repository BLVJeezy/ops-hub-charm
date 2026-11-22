import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Bell, CalendarCheck, Inbox, Lightbulb } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/**
 * In-Hub notifications: a new booking (either booking link) or a new client request.
 * One shared store: it loads the last two weeks, listens for new rows live, and remembers per browser what was seen.
 */
export type Note = {
  id: string;
  kind: "booking" | "request" | "flag" | "idea";
  title: string;
  sub: string;
  at: string;
  to: "/agenda" | "/aanvragen" | "/wijzigingen" | "/ideeen";
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const SEEN_KEY = "notes-seen-at";
let notes: Note[] = [];
let seenAt = "";
let started = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const when = (iso: string) =>
  new Date(iso).toLocaleString("nl-BE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Brussels",
  });
type BookingRow = {
  id: string;
  name: string;
  company: string | null;
  starts_at: string;
  created_at: string;
  client_id: string | null;
  mode: string | null;
};
type RequestRow = {
  id: string;
  title: string;
  urgency: string;
  created_at: string;
  clients?: { name: string } | null;
};
const fromBooking = (b: BookingRow): Note => ({
  id: `b:${b.id}`,
  kind: "booking",
  to: "/agenda",
  at: b.created_at,
  title: `Nieuwe afspraak: ${b.company || b.name}`,
  sub: `${when(b.starts_at)} · ${b.mode === "onsite" ? "ter plaatse" : "online"}${b.client_id ? " · via klantlink" : ""}`,
});
const fromRequest = (r: RequestRow): Note => ({
  id: `r:${r.id}`,
  kind: "request",
  to: "/aanvragen",
  at: r.created_at,
  title: `Nieuwe aanvraag${r.clients?.name ? ` van ${r.clients.name}` : ""}`,
  sub: `${r.title}${r.urgency === "dringend" ? " · dringend" : r.urgency === "hoog" ? " · liefst snel" : ""}`,
});
const put = (n: Note) => {
  if (notes.some((x) => x.id === n.id)) return;
  notes = [n, ...notes].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40);
  emit();
};

type FlagRow = { id: string; site: string; changes: number; flags: string[]; created_at: string };
const SITE_NAME: Record<string, string> = {
  riory: "Riory",
  "villa-amano": "Villa Amano",
  belgomed: "Belgomed",
  "horsey-valley": "Horsey Valley",
  dynamik: "DynaMik",
  tcsc: "TCSC",
};
const FLAG_TEXT: Record<string, string> = {
  seo: "SEO aangepast",
  contact: "contactgegevens",
  removed: "veel tekst weg",
  "many-at-once": "veel tegelijk",
  "many-today": "veel vandaag",
};
// only red flags from client website edits come here; ordinary edits wait quietly in Wijzigingen
const fromFlag = (f: FlagRow): Note => ({
  id: `f:${f.id}`,
  kind: "flag",
  to: "/wijzigingen",
  at: f.created_at,
  title: `Rode vlag: ${SITE_NAME[f.site] ?? f.site}`,
  sub: `${f.changes} ${f.changes === 1 ? "aanpassing" : "aanpassingen"} · ${f.flags.map((x) => FLAG_TEXT[x] ?? x).join(", ")}`,
});

// growth ideas: one note per scan (how many new ideas) and one per idea that is ready to check
type IdeaRow = { id: string; batch: string; title: string; status: string; created_at: string; review_at: string | null };
function ideaNotes(rows: IdeaRow[]): Note[] {
  const batches = new Map<string, { n: number; at: string; titles: string[] }>();
  for (const r of rows) {
    const b = batches.get(r.batch) ?? { n: 0, at: r.created_at, titles: [] };
    b.n++;
    if (r.created_at < b.at) b.at = r.created_at;
    if (b.titles.length < 2) b.titles.push(r.title);
    batches.set(r.batch, b);
  }
  const out: Note[] = [...batches].map(([batch, b]) => ({
    id: `ib:${batch}`,
    kind: "idea",
    to: "/ideeen",
    at: b.at,
    title: `${b.n} ${b.n === 1 ? "nieuw idee" : "nieuwe ideeën"} voor je klanten`,
    sub: b.titles.join(" · "),
  }));
  for (const r of rows)
    if (r.review_at && r.status === "ter_controle")
      out.push({ id: `ir:${r.id}`, kind: "idea", to: "/ideeen", at: r.review_at, title: "Klaar om na te kijken", sub: r.title });
  return out;
}

async function load() {
  const since = new Date(Date.now() - 14 * 864e5).toISOString();
  const [b, r, f, g] = await Promise.all([
    db
      .from("bookings")
      .select("id, name, company, starts_at, created_at, client_id, mode")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(30),
    db
      .from("client_requests")
      .select("id, title, urgency, created_at, clients:client_id(name)")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(30),
    db
      .from("site_change_batches")
      .select("id, site, changes, flags, created_at")
      .gte("created_at", since)
      .neq("flags", "{}")
      .order("created_at", { ascending: false })
      .limit(30),
    db
      .from("growth_ideas")
      .select("id, batch, title, status, created_at, review_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(80),
  ]);
  notes = [
    ...((b.data ?? []) as BookingRow[]).map(fromBooking),
    ...((r.data ?? []) as RequestRow[]).map(fromRequest),
    ...((f.data ?? []) as FlagRow[]).map(fromFlag),
    ...ideaNotes((g.data ?? []) as IdeaRow[]),
  ]
    .sort((x, y) => y.at.localeCompare(x.at))
    .slice(0, 40);
  emit();
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  try {
    seenAt = localStorage.getItem(SEEN_KEY) ?? new Date(0).toISOString();
  } catch {
    seenAt = new Date(0).toISOString();
  }
  void load();
  supabase
    .channel("hub-notes")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "bookings" }, (p) => {
      const n = fromBooking(p.new as BookingRow);
      put(n);
      toast(n.title, { description: n.sub, icon: "📅" });
    })
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "client_requests" },
      async (p) => {
        const row = p.new as RequestRow & { client_id: string };
        const { data } = await db
          .from("clients")
          .select("name")
          .eq("id", row.client_id)
          .maybeSingle();
        const n = fromRequest({ ...row, clients: data });
        put(n);
        toast(n.title, { description: n.sub, icon: "📥" });
      },
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "site_change_batches" },
      (p) => {
        const row = p.new as FlagRow;
        if (!row.flags?.length) return;
        const n = fromFlag(row);
        put(n);
        toast.warning(n.title, { description: n.sub });
      },
    )
    .on("postgres_changes", { event: "*", schema: "public", table: "growth_ideas" }, (p) => {
      const row = p.new as IdeaRow;
      if (!row?.id) return;
      if (p.eventType === "INSERT" && !notes.some((n) => n.id === `ib:${row.batch}`)) {
        // first idea of a new scan: reload so the count is right, and say it once
        void load().then(() => toast("Nieuwe ideeën voor je klanten", { description: "Bekijk ze bij Ideeën", icon: "💡" }));
      } else if (p.eventType === "UPDATE" && row.status === "ter_controle" && row.review_at) {
        const n: Note = { id: `ir:${row.id}`, kind: "idea", to: "/ideeen", at: row.review_at, title: "Klaar om na te kijken", sub: row.title };
        put(n);
        toast(n.title, { description: n.sub, icon: "🔎" });
      }
    })
    .subscribe();
}
function markSeen() {
  seenAt = new Date().toISOString();
  try {
    localStorage.setItem(SEEN_KEY, seenAt);
  } catch {
    /* private mode: seen for this visit only */
  }
  emit();
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  start();
  return () => listeners.delete(l);
};
let snap = { notes, seenAt };
const getSnap = () =>
  snap.notes === notes && snap.seenAt === seenAt ? snap : (snap = { notes, seenAt });
const serverSnap = { notes: [] as Note[], seenAt: "" };

export function useNotes() {
  const s = useSyncExternalStore(subscribe, getSnap, () => serverSnap);
  return { ...s, unseen: s.notes.filter((n) => n.at > s.seenAt).length, markSeen };
}

/** The bell. `up` opens the list above it (for the floating bar on phones). */
export function NotificationBell({
  className = "",
  up = false,
}: {
  className?: string;
  up?: boolean;
}) {
  const { notes: list, seenAt: seen, unseen, markSeen: mark } = useNotes();
  const [open, setOpen] = useState(false);
  const [shownSeen, setShownSeen] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const toggle = () => {
    if (!open) {
      setShownSeen(seen);
      mark();
    } // what was new stays marked while the list is open
    setOpen(!open);
  };
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={unseen ? `Meldingen, ${unseen} nieuw` : "Meldingen"}
        aria-expanded={open}
        className={`press relative inline-flex items-center justify-center rounded-full ${className}`}
      >
        <Bell className="w-[18px] h-[18px]" />
        {unseen > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#C9A14A] text-black text-[10px] font-bold grid place-items-center">
            {unseen > 9 ? "9+" : unseen}
          </span>
        )}
      </button>
      {open && (
        <div
          className={`${up ? "fixed left-3 right-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))]" : "absolute top-full mt-2 right-0 w-[340px]"} rounded-2xl border border-border bg-card shadow-2xl z-50 overflow-hidden text-left`}
        >
          <div className="px-3.5 py-2.5 text-sm font-semibold border-b border-border">
            Meldingen
          </div>
          {list.length === 0 ? (
            <p className="px-3.5 py-6 text-sm text-muted-foreground text-center">
              Nog niets. Nieuwe afspraken en aanvragen komen hier.
            </p>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto divide-y divide-border">
              {list.map((n) => {
                const I =
                    n.kind === "booking"
                      ? CalendarCheck
                      : n.kind === "flag"
                        ? AlertTriangle
                        : n.kind === "idea"
                          ? Lightbulb
                          : Inbox,
                  fresh = n.at > shownSeen;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        navigate({ to: n.to });
                      }}
                      className="w-full flex items-start gap-3 px-3.5 py-2.5 text-left hover:bg-muted/60"
                    >
                      <span
                        className={`mt-0.5 grid place-items-center w-8 h-8 rounded-xl shrink-0 ${n.kind === "booking" ? "bg-[#C9A14A]/15 text-[#C9A14A]" : n.kind === "flag" ? "bg-amber-500/15 text-amber-400" : n.kind === "idea" ? "bg-emerald-500/15 text-emerald-400" : "bg-sky-500/15 text-sky-400"}`}
                      >
                        <I className="w-4 h-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-sm font-medium">
                          <span className="truncate">{n.title}</span>
                          {fresh && (
                            <span
                              className="w-1.5 h-1.5 rounded-full bg-[#C9A14A] shrink-0"
                              aria-label="nieuw"
                            />
                          )}
                        </span>
                        <span className="block text-xs text-muted-foreground truncate">
                          {n.sub}
                        </span>
                        <span className="block text-[11px] text-muted-foreground/80 mt-0.5">
                          {when(n.at)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
