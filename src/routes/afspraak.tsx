import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { FILE_ACCEPT, FILE_RULES, TOPICS, checkFiles, whenLabel } from "@/lib/booking";

export const Route = createFileRoute("/afspraak")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Plan een gesprek · Solyn Global" }, { name: "robots", content: "noindex" }],
  }),
  component: () => <BookingPage />,
});

const ZONE = "Europe/Brussels";
const INK = "#1B222C",
  GOLD = "#B08A2E";
const monthLabel = (m: string) =>
  m
    ? new Intl.DateTimeFormat("nl-BE", { timeZone: "UTC", month: "long", year: "numeric" }).format(
        new Date(`${m}-01T12:00:00Z`),
      )
    : "";
/** The days of a month as calendar cells, Monday first; null for the empty cells before the 1st. */
function monthCells(m: string): (string | null)[] {
  if (!m) return [];
  const [y, mo] = m.split("-").map(Number),
    first = new Date(Date.UTC(y, mo - 1, 1)),
    count = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return [
    ...Array((first.getUTCDay() + 6) % 7).fill(null),
    ...Array.from({ length: count }, (_, i) => `${m}-${String(i + 1).padStart(2, "0")}`),
  ];
}
const dayKey = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(new Date(iso));
const fmt = (iso: string, o: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("nl-BE", { timeZone: ZONE, ...o }).format(new Date(iso));

/** Public page where a client picks a free hour for a meeting. It shows free start times only. */
export type BookingPrefill = { name?: string; email?: string; phone?: string; company?: string };
/** Also used inside a client's own link page: then it has no page frame, starts filled in and the booking is tied to that client. */
export function BookingPage({
  embedded = false,
  prefill,
  token,
}: { embedded?: boolean; prefill?: BookingPrefill; token?: string } = {}) {
  const [slots, setSlots] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: prefill?.name ?? "",
    email: prefill?.email ?? "",
    phone: prefill?.phone ?? "",
    company: prefill?.company ?? "",
    note: "",
    website: "",
    location: "",
  });
  const [mode, setMode] = useState<"online" | "onsite">("online");
  const [files, setFiles] = useState<File[]>([]);
  const [topics, setTopics] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const load = () =>
    fetch("/api/public/booking")
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error);
        setSlots(j.slots ?? []);
      })
      .catch((e) => {
        setSlots([]);
        setError(e?.message || "De agenda is even niet bereikbaar.");
      });
  useEffect(() => {
    void load();
  }, []);

  const days = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const s of slots ?? []) map.set(dayKey(s), [...(map.get(dayKey(s)) ?? []), s]);
    return [...map.entries()];
  }, [slots]);
  useEffect(() => {
    if (days.length && (!day || !days.some(([d]) => d === day))) setDay(days[0][0]);
  }, [days, day]);
  const times = days.find(([d]) => d === day)?.[1] ?? [];
  // the calendar shows one month at a time; only months that have a free day can be opened
  const months = useMemo(() => [...new Set(days.map(([d]) => d.slice(0, 7)))], [days]);
  const [monthPick, setMonth] = useState<string | null>(null);
  const month =
    monthPick && months.includes(monthPick) ? monthPick : (day?.slice(0, 7) ?? months[0] ?? "");

  const book = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slot || sending) return;
    setSending(true);
    setError(null);
    try {
      const body = new FormData();
      Object.entries({
        ...form,
        mode,
        start: slot,
        topics: topics.join(","),
        ...(token ? { token } : {}),
      }).forEach(([k, v]) => body.append(k, v));
      files.forEach((f) => body.append("files", f));
      const r = await fetch("/api/public/booking", { method: "POST", body });
      const j = await r.json().catch(() => ({}));
      if (r.ok) setDone(slot);
      else {
        setError(j.error || "Boeken lukte niet. Probeer het opnieuw.");
        if (r.status === 409) {
          setSlot(null);
          void load();
        }
      }
    } catch {
      setError("Geen verbinding. Probeer het opnieuw.");
    } finally {
      setSending(false);
    }
  };
  const addFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = [...files, ...Array.from(e.target.files ?? [])];
    e.target.value = "";
    const problem = checkFiles(next);
    if (problem) setError(problem);
    else {
      setFiles(next);
      setError(null);
    }
  };
  const field =
    "w-full h-12 rounded-xl border border-black/15 bg-white px-3.5 text-base outline-none focus:border-black/60";
  const set =
    (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const body = (
    <>
      {done ? (
        <section className={embedded ? "mt-6" : "mt-12"} aria-live="polite">
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
            Je afspraak staat vast.
          </h1>
          <p className="mt-4 text-lg">
            We spreken elkaar op <strong>{whenLabel(done)}</strong>, voor een uur
            {mode === "onsite" ? `, bij jou: ${form.location}` : ", online"}.
          </p>
          <p className="mt-2 text-black/60">
            Je krijgt een bevestiging per mail op {form.email}. Past het toch niet, antwoord dan op
            die mail.
          </p>
        </section>
      ) : (
        <>
          <h1
            className={
              embedded
                ? "mt-6 text-2xl md:text-3xl font-semibold tracking-tight"
                : "mt-10 text-3xl md:text-4xl font-semibold tracking-tight"
            }
          >
            Plan een gesprek met Jason
          </h1>
          <p className={embedded ? "mt-1.5 text-black/60" : "mt-3 text-black/60 text-lg"}>
            Een uur, online of bij jou ter plaatse. Kies een moment dat past; je ziet alleen de uren
            die nog vrij zijn.
          </p>

          {slots === null ? (
            <p className="mt-10 text-black/50">Vrije momenten laden…</p>
          ) : days.length === 0 ? (
            <p className="mt-10 rounded-2xl bg-black/[0.04] p-5">
              {error ??
                "Er zijn de komende weken geen vrije momenten. Mail naar jason@solynglobal.be, dan zoeken we samen een moment."}
            </p>
          ) : (
            <div className="mt-8 grid gap-8 md:grid-cols-[1fr_320px]">
              <section aria-label="Kies een moment" className="min-w-0">
                <h2 className="text-sm font-semibold">1. Kies een dag</h2>
                <div className="mt-3 rounded-2xl border border-black/15 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <button
                      type="button"
                      onClick={() => setMonth(months[months.indexOf(month) - 1])}
                      disabled={months.indexOf(month) <= 0}
                      aria-label="Vorige maand"
                      className="w-10 h-10 grid place-items-center rounded-full border border-black/15 disabled:opacity-30"
                    >
                      ‹
                    </button>
                    <div className="text-sm font-semibold capitalize" aria-live="polite">
                      {monthLabel(month)}
                    </div>
                    <button
                      type="button"
                      onClick={() => setMonth(months[months.indexOf(month) + 1])}
                      disabled={months.indexOf(month) >= months.length - 1}
                      aria-label="Volgende maand"
                      className="w-10 h-10 grid place-items-center rounded-full border border-black/15 disabled:opacity-30"
                    >
                      ›
                    </button>
                  </div>
                  <div className="grid grid-cols-7 gap-1 text-center">
                    {["ma", "di", "wo", "do", "vr", "za", "zo"].map((w) => (
                      <div key={w} className="text-xs text-black/45 py-1">
                        {w}
                      </div>
                    ))}
                    {monthCells(month).map((d, i) => {
                      if (!d) return <div key={`e${i}`} />;
                      const free = days.some(([k]) => k === d),
                        on = d === day;
                      return (
                        <button
                          key={d}
                          type="button"
                          disabled={!free}
                          onClick={() => {
                            setDay(d);
                            setSlot(null);
                            setMonth(null);
                          }}
                          aria-pressed={on}
                          aria-label={`${Number(d.slice(8))} ${monthLabel(month)}${free ? "" : ", niet beschikbaar"}`}
                          className={`aspect-square rounded-full text-sm tabular-nums transition-colors ${free && !on ? "font-semibold hover:bg-black/[0.06]" : ""}`}
                          style={
                            on
                              ? { background: INK, color: "#fff", fontWeight: 600 }
                              : free
                                ? undefined
                                : { color: "rgba(0,0,0,0.25)" }
                          }
                        >
                          {Number(d.slice(8))}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <h2 className="mt-6 text-sm font-semibold">2. Kies een uur</h2>
                <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {times.map((s) => {
                    const on = s === slot;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => {
                          setSlot(s);
                          setError(null);
                        }}
                        aria-pressed={on}
                        className="h-12 rounded-xl border text-base font-medium tabular-nums transition-colors"
                        style={
                          on
                            ? { background: GOLD, color: "#fff", borderColor: GOLD }
                            : { borderColor: "rgba(0,0,0,0.15)" }
                        }
                      >
                        {fmt(s, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-3 text-xs text-black/50">Tijden in Belgische tijd.</p>
              </section>

              <form onSubmit={book} className="space-y-3 min-w-0" aria-label="Je gegevens">
                <h2 className="text-sm font-semibold">3. Je gegevens</h2>
                <p
                  className="text-sm rounded-xl px-3.5 py-3"
                  style={{ background: slot ? "rgba(176,138,46,0.12)" : "rgba(0,0,0,0.04)" }}
                >
                  {slot ? (
                    <>
                      Gekozen: <strong>{whenLabel(slot)}</strong>
                    </>
                  ) : (
                    "Kies eerst een dag en een uur."
                  )}
                </p>
                <div
                  role="group"
                  aria-label="Hoe spreken we af?"
                  className="grid grid-cols-2 gap-2"
                >
                  <button
                    type="button"
                    onClick={() => setMode("online")}
                    aria-pressed={mode === "online"}
                    className="h-12 rounded-xl border text-sm font-medium transition-colors"
                    style={
                      mode === "online"
                        ? { background: INK, color: "#fff", borderColor: INK }
                        : { borderColor: "rgba(0,0,0,0.15)" }
                    }
                  >
                    Online meeting
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("onsite")}
                    aria-pressed={mode === "onsite"}
                    className="h-12 rounded-xl border text-sm font-medium transition-colors"
                    style={
                      mode === "onsite"
                        ? { background: INK, color: "#fff", borderColor: INK }
                        : { borderColor: "rgba(0,0,0,0.15)" }
                    }
                  >
                    Ter plaatse
                  </button>
                </div>
                {mode === "onsite" && (
                  <label className="block">
                    <span className="text-sm">Adres waar we afspreken</span>
                    <input
                      required
                      minLength={5}
                      autoComplete="street-address"
                      placeholder="Straat en nummer, gemeente"
                      value={form.location}
                      onChange={set("location")}
                      className={field}
                    />
                  </label>
                )}
                <label className="block">
                  <span className="text-sm">Naam</span>
                  <input
                    required
                    minLength={2}
                    autoComplete="name"
                    value={form.name}
                    onChange={set("name")}
                    className={field}
                  />
                </label>
                <label className="block">
                  <span className="text-sm">E-mail</span>
                  <input
                    required
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    value={form.email}
                    onChange={set("email")}
                    className={field}
                  />
                </label>
                <label className="block">
                  <span className="text-sm">
                    Telefoon <span className="text-black/45">(optioneel)</span>
                  </span>
                  <input
                    type="tel"
                    autoComplete="tel"
                    value={form.phone}
                    onChange={set("phone")}
                    className={field}
                  />
                </label>
                <label className="block">
                  <span className="text-sm">
                    Bedrijf <span className="text-black/45">(optioneel)</span>
                  </span>
                  <input
                    autoComplete="organization"
                    value={form.company}
                    onChange={set("company")}
                    className={field}
                  />
                </label>
                <div>
                  <span className="text-sm">
                    Waarover wil je het hebben? <span className="text-black/45">(optioneel)</span>
                  </span>
                  <div role="group" aria-label="Onderwerp" className="mt-1.5 flex flex-wrap gap-2">
                    {TOPICS.map((t) => {
                      const on = topics.includes(t);
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() =>
                            setTopics(on ? topics.filter((x) => x !== t) : [...topics, t])
                          }
                          aria-pressed={on}
                          className="h-10 px-3.5 rounded-full border text-sm font-medium transition-colors"
                          style={
                            on
                              ? { background: INK, color: "#fff", borderColor: INK }
                              : { borderColor: "rgba(0,0,0,0.15)" }
                          }
                        >
                          {t}
                        </button>
                      );
                    })}
                  </div>
                  <textarea
                    rows={3}
                    aria-label="Meer uitleg"
                    placeholder="Meer uitleg, als je wil"
                    value={form.note}
                    onChange={set("note")}
                    className={`${field} h-auto py-3 mt-2`}
                  />
                </div>
                <div>
                  <span className="text-sm">
                    Foto's of pdf's <span className="text-black/45">(optioneel, hoogstens 5)</span>
                  </span>
                  {files.length > 0 && (
                    <ul className="mt-1.5 space-y-1">
                      {files.map((f, i) => (
                        <li
                          key={`${f.name}-${i}`}
                          className="flex items-center gap-2 text-sm rounded-lg bg-black/[0.04] pl-3 pr-1 min-h-10"
                        >
                          <span className="flex-1 truncate">{f.name}</span>
                          <button
                            type="button"
                            onClick={() => setFiles(files.filter((_, j) => j !== i))}
                            aria-label={`Verwijder ${f.name}`}
                            className="w-9 h-9 grid place-items-center text-lg leading-none"
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {files.length < FILE_RULES.max && (
                    <label className="mt-1.5 flex items-center justify-center h-12 rounded-xl border border-dashed border-black/15 text-sm font-medium cursor-pointer">
                      Bestand toevoegen
                      <input
                        type="file"
                        multiple
                        accept={FILE_ACCEPT}
                        onChange={addFiles}
                        className="sr-only"
                      />
                    </label>
                  )}
                </div>
                <input
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden
                  value={form.website}
                  onChange={set("website")}
                  className="absolute -left-[9999px] w-px h-px opacity-0"
                  name="website"
                />
                {error && (
                  <p
                    role="alert"
                    className="text-sm rounded-xl border border-red-300 bg-red-50 text-red-800 px-3.5 py-3"
                  >
                    {error}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={!slot || sending}
                  className="w-full h-13 min-h-[52px] rounded-xl text-base font-semibold text-white disabled:opacity-40"
                  style={{ background: INK }}
                >
                  {sending ? "Bezig met boeken…" : "Afspraak boeken"}
                </button>
              </form>
            </div>
          )}
        </>
      )}
    </>
  );
  if (embedded) return <div style={{ color: INK }}>{body}</div>;
  return (
    <main
      className="min-h-screen bg-white overflow-x-hidden"
      style={{ color: INK, colorScheme: "light" }}
    >
      <div className="mx-auto max-w-3xl px-5 py-8 md:py-14">
        <header className="flex items-center gap-3">
          <img src="/logos/core.png" alt="" className="w-11 h-11 rounded-full object-cover" />
          <div className="text-sm font-semibold">Solyn Global</div>
        </header>
        {body}
      </div>
    </main>
  );
}
