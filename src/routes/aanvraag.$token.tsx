import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FILE_ACCEPT, checkFiles } from "@/lib/booking";
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

  const load = () =>
    fetch(`/api/public/request?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error);
        setClient(j.client);
        setMine(j.requests ?? []);
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

        {linkError ? (
          <p className="mt-12 rounded-2xl bg-black/[0.04] p-5">{linkError}</p>
        ) : !client ? (
          <p className="mt-12 text-black/50">Laden…</p>
        ) : (
          <>
            <h1 className="mt-10 text-3xl md:text-4xl font-semibold tracking-tight">
              Wat mogen we voor {client} doen?
            </h1>
            <p className="mt-3 text-black/60 text-lg">
              Zet hier elke vraag of wijziging. Zo staat alles op één plek, zien we wat het eerst
              moet, en zie jij hieronder hoe ver het staat.
            </p>

            {sent && (
              <div
                className="mt-6 rounded-2xl p-4"
                style={{ background: "#F5EFE1" }}
                aria-live="polite"
              >
                <strong>Aanvraag ontvangen.</strong> We plannen ze in en je ziet hieronder wanneer
                we eraan beginnen.
                <button type="button" onClick={() => setSent(false)} className="ml-2 underline">
                  Nog een aanvraag
                </button>
              </div>
            )}

            {!sent && (
              <form onSubmit={submit} className="mt-8 space-y-7" noValidate>
                <fieldset>
                  <legend className="text-sm font-semibold">1. Waarover gaat het?</legend>
                  <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-2">
                    {KINDS.map((k) => (
                      <button
                        key={k.id}
                        type="button"
                        onClick={() => setKind(k.id)}
                        aria-pressed={kind === k.id}
                        className={`rounded-xl border p-3 text-left transition-colors ${kind === k.id ? "border-black bg-black text-white" : "border-black/15 hover:border-black/40"}`}
                      >
                        <span className="block text-sm font-semibold">{k.label}</span>
                        <span
                          className={`block text-xs mt-0.5 ${kind === k.id ? "text-white/70" : "text-black/50"}`}
                        >
                          {k.hint}
                        </span>
                      </button>
                    ))}
                  </div>
                </fieldset>

                {kind === "nieuwe-pagina" && (
                  <div className="rounded-2xl border border-black/15 p-4 flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-3 text-sm">
                      Hoeveel pagina's?
                      <input
                        type="number"
                        min={1}
                        max={50}
                        inputMode="numeric"
                        value={form.pages}
                        onChange={set("pages")}
                        className="w-20 h-11 rounded-xl border border-black/15 px-3 text-base"
                      />
                    </label>
                    <div className="text-sm">
                      <span className="text-black/55">Richtprijs: </span>
                      <strong>€{price}</strong>
                      <span className="text-black/55">
                        {" "}
                        · een nieuwe pagina kost minimaal €{PAGE_RATE}
                      </span>
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-sm font-semibold" htmlFor="rq-title">
                    2. In één zin
                  </label>
                  <input
                    id="rq-title"
                    className={`${field} mt-3`}
                    maxLength={140}
                    placeholder="Bv. nieuwe openingsuren op de homepage"
                    value={form.title}
                    onChange={set("title")}
                  />
                  <textarea
                    className={`${field} mt-2 h-32 py-3`}
                    maxLength={4000}
                    placeholder="Wat moet er precies gebeuren? Teksten, links, voorbeelden: alles helpt."
                    value={form.details}
                    onChange={set("details")}
                  />
                </div>

                <fieldset>
                  <legend className="text-sm font-semibold">3. Hoe dringend is het?</legend>
                  <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
                    {URGENCY.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => setUrgency(u.id)}
                        aria-pressed={urgency === u.id}
                        className={`rounded-xl border p-3 text-left transition-colors ${urgency === u.id ? "border-black bg-black text-white" : "border-black/15 hover:border-black/40"}`}
                      >
                        <span className="block text-sm font-semibold">{u.label}</span>
                        <span
                          className={`block text-xs mt-0.5 ${urgency === u.id ? "text-white/70" : "text-black/50"}`}
                        >
                          {u.hint}
                        </span>
                      </button>
                    ))}
                  </div>
                  <label className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                    Liefst klaar tegen <span className="text-black/45">(mag leeg)</span>
                    <input
                      type="date"
                      min={today}
                      value={form.wished_date}
                      onChange={set("wished_date")}
                      className="h-11 rounded-xl border border-black/15 px-3 text-base"
                    />
                  </label>
                </fieldset>

                <div>
                  <div className="text-sm font-semibold">
                    4. Foto's of pdf's <span className="font-normal text-black/45">(mag leeg)</span>
                  </div>
                  <label className="mt-3 inline-flex h-11 items-center rounded-full border border-black/15 px-4 text-sm cursor-pointer hover:border-black/40">
                    Bestand toevoegen
                    <input
                      type="file"
                      multiple
                      accept={FILE_ACCEPT}
                      onChange={addFiles}
                      className="sr-only"
                    />
                  </label>
                  {files.length > 0 && (
                    <ul className="mt-2 space-y-1 text-sm">
                      {files.map((f, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <span className="truncate min-w-0">{f.name}</span>
                          <button
                            type="button"
                            onClick={() => setFiles(files.filter((_, j) => j !== i))}
                            className="text-black/50 underline shrink-0"
                          >
                            weg
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="grid md:grid-cols-2 gap-2">
                  <input
                    className={field}
                    placeholder="Je naam (mag leeg)"
                    maxLength={80}
                    value={form.contact_name}
                    onChange={set("contact_name")}
                    autoComplete="name"
                  />
                  <input
                    className={field}
                    type="email"
                    placeholder="Je e-mail, voor vragen (mag leeg)"
                    maxLength={120}
                    value={form.contact_email}
                    onChange={set("contact_email")}
                    autoComplete="email"
                  />
                </div>
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
                <button
                  type="submit"
                  disabled={sending}
                  className="h-12 px-6 rounded-full text-white font-semibold disabled:opacity-50"
                  style={{ background: INK }}
                >
                  {sending ? "Versturen…" : "Aanvraag versturen"}
                </button>
              </form>
            )}

            <section className="mt-14">
              <h2 className="text-lg font-semibold">Jouw aanvragen</h2>
              {mine.length === 0 ? (
                <p className="mt-2 text-black/55">Nog geen aanvragen.</p>
              ) : (
                <ul className="mt-3 divide-y divide-black/10 border-y border-black/10">
                  {mine.map((r) => (
                    <li key={r.id} className="py-3 flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{r.title}</div>
                        <div className="text-xs text-black/50 mt-0.5">
                          {kindLabel(r.kind)}
                          {r.estimate_eur ? ` · richtprijs €${Number(r.estimate_eur)}` : ""} ·{" "}
                          {date(r.created_at)}
                          {r.wished_date ? ` · gewenst ${date(r.wished_date)}` : ""}
                        </div>
                      </div>
                      <span
                        className={`text-xs rounded-full px-2.5 py-1 shrink-0 ${STATUS_TONE[r.status]}`}
                      >
                        {STATUS_LABEL[r.status]}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <p className="mt-10 text-sm text-black/50">
              Liever even bellen of afspreken?{" "}
              <a
                href="https://solynglobal.be/afspraak"
                className="underline"
                style={{ color: GOLD }}
              >
                Plan een gesprek
              </a>
              .
            </p>
          </>
        )}
      </div>
    </main>
  );
}
