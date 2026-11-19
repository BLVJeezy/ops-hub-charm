import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ComponentType } from "react";
import {
  Bug,
  CalendarDays,
  ChevronDown,
  FilePlus2,
  Megaphone,
  MessageCircle,
  Paperclip,
  PencilLine,
  Search,
  X,
} from "lucide-react";
import { FILE_ACCEPT, checkFiles } from "@/lib/booking";
import { BookingPage, type BookingPrefill } from "@/routes/afspraak";
import {
  KINDS,
  PAGE_RATE,
  STATUS_LABEL,
  URGENCY,
  checkRequest,
  estimate,
  kindLabel,
  type Kind,
  type Status,
  type Urgency,
} from "@/lib/client-requests";

export const Route = createFileRoute("/aanvraag/$token")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Aanvraag · Solyn Global" }, { name: "robots", content: "noindex" }],
  }),
  component: RequestPage,
});

const INK = "#1B222C",
  GOLD = "#B08A2E";
type Mine = {
  id: string;
  title: string;
  kind: Kind;
  pages: number | null;
  status: Status;
  estimate_eur: number | null;
  wished_date: string | null;
  created_at: string;
};
const STATUS_TONE: Record<Status, string> = {
  nieuw: "bg-black/[0.06]",
  ingepland: "bg-sky-100 text-sky-900",
  bezig: "bg-amber-100 text-amber-900",
  klaar: "bg-emerald-100 text-emerald-900",
  afgewezen: "bg-black/[0.04] text-black/50",
};
const KIND_ICON: Record<Kind, ComponentType<{ className?: string }>> = {
  wijziging: PencilLine,
  "nieuwe-pagina": FilePlus2,
  seo: Search,
  social: Megaphone,
  probleem: Bug,
  andere: MessageCircle,
};
const SHORT: Record<Kind, string> = {
  wijziging: "Aanpassen",
  "nieuwe-pagina": "Nieuwe pagina",
  seo: "SEO",
  social: "Social",
  probleem: "Werkt niet",
  andere: "Iets anders",
};
const date = (iso: string) =>
  new Date(iso).toLocaleDateString("nl-BE", { day: "numeric", month: "short" });

/** A client's own page to send a request. The link carries a private token; it only ever shows that client's requests. */
function RequestPage() {
  const { token } = Route.useParams();
  const [client, setClient] = useState<string | null>(null);
  const [mine, setMine] = useState<Mine[]>([]);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind | null>(null);
  const [urgency, setUrgency] = useState<Urgency>("normaal");
  const [form, setForm] = useState({
    title: "",
    details: "",
    pages: "1",
    wished_date: "",
    contact_name: "",
    contact_email: "",
    website: "",
  });
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [more, setMore] = useState(false);
  const [tab, setTab] = useState<"aanvraag" | "afspraak">(() =>
    typeof window !== "undefined" && window.location.hash === "#afspraak" ? "afspraak" : "aanvraag",
  );
  const [prefill, setPrefill] = useState<BookingPrefill | null>(null);
  const openCount = mine.filter((r) => ["nieuw", "ingepland", "bezig"].includes(r.status)).length;

  const load = () =>
    fetch(`/api/public/request?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error);
        setClient(j.client);
        setMine(j.requests ?? []);
        setPrefill({
          name: j.contact?.name ?? "",
          email: j.contact?.email ?? "",
          phone: j.contact?.phone ?? "",
          company: j.client ?? "",
        });
      })
      .catch((e) => setLinkError(e?.message || "Even niet bereikbaar."));
  useEffect(() => {
    load();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const set =
    (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));
  const field =
    "w-full h-12 rounded-xl border border-black/15 bg-white px-3.5 text-base outline-none focus:border-black/60";
  const pages = Math.max(1, Math.min(50, Math.round(Number(form.pages) || 1)));
  const price = kind ? estimate(kind, pages) : null;
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Brussels" });

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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const input = {
      title: form.title,
      details: form.details,
      kind: kind ?? undefined,
      pages,
      urgency,
      wished_date: form.wished_date || null,
      contact_email: form.contact_email || undefined,
    };
    const bad = kind ? checkRequest(input as never, today) : "Kies eerst wat voor aanvraag het is.";
    if (bad) {
      setError(bad);
      return;
    }
    setSending(true);
    setError(null);
    const body = new FormData();
    body.set("token", token);
    Object.entries(form).forEach(([k, v]) => body.set(k, k === "pages" ? String(pages) : v));
    body.set("kind", kind!);
    body.set("urgency", urgency);
    files.forEach((f) => body.append("files", f));
    try {
      const r = await fetch("/api/public/request", { method: "POST", body });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error);
      setSent(true);
      setForm((f) => ({ ...f, title: "", details: "", pages: "1", wished_date: "" }));
      setKind(null);
      setUrgency("normaal");
      setFiles([]);
      load();
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Versturen lukte niet. Probeer het opnieuw.",
      );
    } finally {
      setSending(false);
    }
  }

  const chip = (on: boolean) =>
    `rounded-xl border transition-colors active:scale-[0.97] ${on ? "border-black bg-black text-white" : "border-black/15 bg-white hover:border-black/40"}`;
  const kindHint = kind ? KINDS.find((k) => k.id === kind)?.hint : null;
  const urgHint = URGENCY.find((u) => u.id === urgency)?.hint;

  return (
    <main
      className="min-h-screen bg-white overflow-x-hidden"
      style={{ color: INK, colorScheme: "light" }}
    >
      <div className="mx-auto max-w-2xl px-4 md:px-5 pt-5 pb-28 md:py-12">
        <header className="flex items-center gap-2.5">
          <img src="/logos/core.png" alt="" className="w-9 h-9 rounded-full object-cover" />
          <div className="text-sm font-semibold flex-1">Solyn Global</div>
          {mine.length > 0 && (
            <a
              href="#mijn"
              className="text-xs rounded-full border border-black/15 px-3 h-8 inline-flex items-center gap-1.5"
            >
              Jouw aanvragen{" "}
              {openCount > 0 && (
                <span className="rounded-full bg-black text-white px-1.5 leading-5">
                  {openCount}
                </span>
              )}
            </a>
          )}
        </header>

        {linkError ? (
          <p className="mt-10 rounded-2xl bg-black/[0.04] p-5">{linkError}</p>
        ) : !client ? (
          <p className="mt-10 text-black/50">Laden…</p>
        ) : (
          <>
            <h1 className="mt-7 md:mt-10 text-2xl md:text-4xl font-semibold tracking-tight">
              Wat mogen we voor {client} doen?
            </h1>
            <div
              className="mt-5 grid grid-cols-2 rounded-full bg-black/[0.05] p-1 text-sm font-semibold max-w-sm"
              role="tablist"
            >
              {(["aanvraag", "afspraak"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => {
                    setTab(t);
                    history.replaceState(
                      null,
                      "",
                      t === "afspraak" ? "#afspraak" : location.pathname,
                    );
                  }}
                  className={`h-10 rounded-full transition-colors ${tab === t ? "bg-white shadow-sm" : "text-black/55"}`}
                >
                  {t === "aanvraag" ? "Iets aanvragen" : "Afspraak maken"}
                </button>
              ))}
            </div>
            {tab === "afspraak" ? (
              prefill && <BookingPage embedded prefill={prefill} token={token} />
            ) : (
              <>
                <p className="mt-4 text-black/60">
                  Eén aanvraag per vraag of wijziging. Hieronder zie je hoe ver ze staan.
                </p>

                {sent && (
                  <div
                    className="mt-5 rounded-2xl p-4 flex items-start gap-3"
                    style={{ background: "#F5EFE1" }}
                    aria-live="polite"
                  >
                    <div className="flex-1">
                      <strong>Aanvraag ontvangen.</strong> Je ziet hieronder wanneer we eraan
                      beginnen.
                    </div>
                    <button
                      type="button"
                      onClick={() => setSent(false)}
                      className="shrink-0 h-9 px-3 rounded-full text-sm text-white"
                      style={{ background: INK }}
                    >
                      Nog een
                    </button>
                  </div>
                )}

                {!sent && (
                  <form id="rq" onSubmit={submit} className="mt-6 space-y-5" noValidate>
                    <fieldset>
                      <legend className="text-sm font-semibold">Waarover gaat het?</legend>
                      <div className="mt-2 grid grid-cols-3 gap-1.5 md:gap-2">
                        {KINDS.map((k) => {
                          const I = KIND_ICON[k.id];
                          return (
                            <button
                              key={k.id}
                              type="button"
                              onClick={() => setKind(k.id)}
                              aria-pressed={kind === k.id}
                              className={`${chip(kind === k.id)} h-[68px] flex flex-col items-center justify-center gap-1 px-1 text-center`}
                            >
                              <I className="w-5 h-5" />
                              <span className="text-xs font-semibold leading-tight">
                                <span className="md:hidden">{SHORT[k.id]}</span>
                                <span className="hidden md:inline">{k.label}</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      {kind && kind !== "nieuwe-pagina" && (
                        <p className="mt-1.5 text-xs text-black/50">{kindHint}</p>
                      )}
                      {kind === "nieuwe-pagina" && (
                        <div className="mt-2 rounded-xl bg-black/[0.04] px-3 py-2 flex items-center gap-3 text-sm">
                          <div className="inline-flex items-center rounded-full border border-black/15 bg-white">
                            <button
                              type="button"
                              aria-label="Eén pagina minder"
                              onClick={() =>
                                setForm((f) => ({ ...f, pages: String(Math.max(1, pages - 1)) }))
                              }
                              className="w-9 h-9 text-lg"
                            >
                              −
                            </button>
                            <span
                              className="w-7 text-center tabular-nums font-semibold"
                              aria-live="polite"
                            >
                              {pages}
                            </span>
                            <button
                              type="button"
                              aria-label="Eén pagina meer"
                              onClick={() =>
                                setForm((f) => ({ ...f, pages: String(Math.min(50, pages + 1)) }))
                              }
                              className="w-9 h-9 text-lg"
                            >
                              +
                            </button>
                          </div>
                          <div className="min-w-0 leading-tight">
                            <div>
                              {pages === 1 ? "pagina" : "pagina's"} · <strong>€{price}</strong>
                            </div>
                            <div className="text-xs text-black/50">
                              minimaal €{PAGE_RATE} per pagina
                            </div>
                          </div>
                        </div>
                      )}
                    </fieldset>

                    <div>
                      <label className="text-sm font-semibold" htmlFor="rq-title">
                        Wat moet er gebeuren?
                      </label>
                      <input
                        id="rq-title"
                        className={`${field} mt-2`}
                        maxLength={140}
                        placeholder="In één zin, bv. nieuwe openingsuren"
                        value={form.title}
                        onChange={set("title")}
                      />
                      <textarea
                        className={`${field} mt-1.5 h-24 py-3`}
                        maxLength={4000}
                        placeholder="Details, teksten of links (mag leeg)"
                        value={form.details}
                        onChange={set("details")}
                      />
                    </div>

                    <fieldset>
                      <legend className="text-sm font-semibold">Hoe dringend?</legend>
                      <div className="mt-2 grid grid-cols-4 gap-1.5 md:gap-2">
                        {URGENCY.map((u) => (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => setUrgency(u.id)}
                            aria-pressed={urgency === u.id}
                            className={`${chip(urgency === u.id)} h-11 px-1 text-xs font-semibold leading-tight`}
                          >
                            {u.label}
                          </button>
                        ))}
                      </div>
                      <p className="mt-1.5 text-xs text-black/50">{urgHint}</p>
                    </fieldset>

                    <div className="flex flex-wrap gap-2">
                      <label
                        className={`h-10 rounded-full border px-3 inline-flex items-center gap-2 text-sm ${form.wished_date ? "border-black" : "border-black/15"}`}
                      >
                        <CalendarDays className="w-4 h-4 shrink-0" />
                        <span className="sr-only">Liefst klaar tegen</span>
                        <input
                          type="date"
                          min={today}
                          value={form.wished_date}
                          onChange={set("wished_date")}
                          className="bg-transparent outline-none w-[8.5rem] text-sm"
                          aria-label="Liefst klaar tegen"
                        />
                      </label>
                      <label className="h-10 rounded-full border border-black/15 px-3 inline-flex items-center gap-2 text-sm cursor-pointer hover:border-black/40">
                        <Paperclip className="w-4 h-4" /> Foto of pdf
                        <input
                          type="file"
                          multiple
                          accept={FILE_ACCEPT}
                          onChange={addFiles}
                          className="sr-only"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => setMore((m) => !m)}
                        aria-expanded={more}
                        className="h-10 rounded-full border border-black/15 px-3 inline-flex items-center gap-1.5 text-sm"
                      >
                        Je gegevens{" "}
                        <ChevronDown
                          className={`w-4 h-4 transition-transform ${more ? "rotate-180" : ""}`}
                        />
                      </button>
                    </div>
                    {files.length > 0 && (
                      <ul className="flex flex-wrap gap-1.5 -mt-2">
                        {files.map((f, i) => (
                          <li
                            key={i}
                            className="max-w-full inline-flex items-center gap-1 rounded-full bg-black/[0.05] pl-3 pr-1 h-8 text-xs"
                          >
                            <span className="truncate max-w-[180px]">{f.name}</span>
                            <button
                              type="button"
                              aria-label={`${f.name} weghalen`}
                              onClick={() => setFiles(files.filter((_, j) => j !== i))}
                              className="w-6 h-6 grid place-items-center rounded-full hover:bg-black/10"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {more && (
                      <div className="grid md:grid-cols-2 gap-1.5 -mt-2">
                        <input
                          className={field}
                          placeholder="Je naam"
                          maxLength={80}
                          value={form.contact_name}
                          onChange={set("contact_name")}
                          autoComplete="name"
                        />
                        <input
                          className={field}
                          type="email"
                          placeholder="Je e-mail, voor vragen"
                          maxLength={120}
                          value={form.contact_email}
                          onChange={set("contact_email")}
                          autoComplete="email"
                        />
                      </div>
                    )}
                    <input
                      tabIndex={-1}
                      autoComplete="off"
                      aria-hidden
                      className="absolute -left-[9999px]"
                      value={form.website}
                      onChange={set("website")}
                    />

                    {error && (
                      <p className="text-sm text-red-700" role="alert">
                        {error}
                      </p>
                    )}
                    <div
                      className="fixed md:static inset-x-0 bottom-0 z-10 border-t md:border-0 border-black/10 bg-white/95 backdrop-blur px-4 py-3 md:p-0"
                      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
                    >
                      <div className="mx-auto max-w-2xl flex items-center gap-3">
                        <div className="flex-1 min-w-0 text-xs text-black/55 md:hidden truncate">
                          {kind
                            ? `${SHORT[kind]}${price ? ` · €${price}` : ""} · ${URGENCY.find((u) => u.id === urgency)?.label}`
                            : "Kies waarover het gaat"}
                        </div>
                        <button
                          type="submit"
                          form="rq"
                          disabled={sending}
                          className="h-12 px-6 rounded-full text-white font-semibold disabled:opacity-50 shrink-0"
                          style={{ background: INK }}
                        >
                          {sending ? "Versturen…" : "Versturen"}
                        </button>
                      </div>
                    </div>
                  </form>
                )}
              </>
            )}
            <section id="mijn" className="mt-12 scroll-mt-4">
              <h2 className="text-base font-semibold">Jouw aanvragen</h2>
              {mine.length === 0 ? (
                <p className="mt-2 text-sm text-black/55">Nog geen aanvragen.</p>
              ) : (
                <ul className="mt-2 divide-y divide-black/10 border-y border-black/10">
                  {mine.map((r) => {
                    const I = KIND_ICON[r.kind] ?? MessageCircle;
                    return (
                      <li key={r.id} className="py-2.5 flex items-center gap-3">
                        <I className="w-4 h-4 text-black/40 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">{r.title}</div>
                          <div className="text-xs text-black/50 truncate">
                            {date(r.created_at)}
                            {r.estimate_eur ? ` · €${Number(r.estimate_eur)}` : ""}
                            {r.wished_date ? ` · gewenst ${date(r.wished_date)}` : ""}
                          </div>
                        </div>
                        <span
                          className={`text-xs rounded-full px-2.5 py-1 shrink-0 ${STATUS_TONE[r.status]}`}
                        >
                          {STATUS_LABEL[r.status]}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
            <p className="mt-8 text-sm text-black/50">
              Liever even bellen of afspreken?{" "}
              <button
                type="button"
                onClick={() => {
                  setTab("afspraak");
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="underline"
                style={{ color: GOLD }}
              >
                Plan een gesprek
              </button>
              .
            </p>
          </>
        )}
      </div>
    </main>
  );
}
