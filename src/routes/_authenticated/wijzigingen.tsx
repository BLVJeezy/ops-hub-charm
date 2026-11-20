import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  FileText,
  History,
  Image as ImageIcon,
  Phone,
  RotateCcw,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { FLAG_LABEL, type Flag } from "@/lib/site-changes";
import { undoSiteChange } from "@/lib/site-changes.functions";

export const Route = createFileRoute("/_authenticated/wijzigingen")({ component: ChangesPage });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
type Batch = {
  id: string;
  site: string;
  client_id: string | null;
  action: "publish" | "restore" | "undo";
  by_whom: "klant" | "solyn";
  changes: number;
  flags: Flag[];
  reviewed_at: string | null;
  created_at: string;
};
type Row = {
  id: string;
  batch_id: string;
  kind: "text" | "img" | "contact";
  key: string;
  page: string | null;
  tag: string | null;
  before: string | null;
  after: string | null;
  seo: boolean;
  why: string[];
};
const SITE_NAME: Record<string, string> = {
  riory: "Riory",
  "villa-amano": "Villa Amano",
  belgomed: "Belgomed",
  "horsey-valley": "Horsey Valley",
  dynamik: "DynaMik",
  tcsc: "TCSC",
};
const nameOf = (s: string) => SITE_NAME[s] ?? s;
const stamp = (d: string) =>
  new Date(d).toLocaleString("nl-BE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
const HOW: Record<Batch["action"], string> = {
  publish: "gepubliceerd via de beheerpagina",
  restore: "oude versie teruggezet via de beheerpagina",
  undo: "teruggedraaid door jou",
};

/** What clients change on their own websites: where, what and how, with red flags, to follow up in peace. No notification per change. */
function ChangesPage() {
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [rows, setRows] = useState<Record<string, Row[]>>({});
  const [show, setShow] = useState<"open" | "all">("open");
  const [site, setSite] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [colors, setColors] = useState<Record<string, string | null>>({});

  const load = useCallback(async () => {
    const [b, c] = await Promise.all([
      db
        .from("site_change_batches")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300),
      db.from("clients").select("id, brand_color"),
    ]);
    if (b.error) toast.error(b.error.message);
    setBatches(b.data ?? []);
    setColors(
      Object.fromEntries(
        (c.data ?? []).map((x: { id: string; brand_color: string | null }) => [
          x.id,
          x.brand_color,
        ]),
      ),
    );
  }, []);
  useEffect(() => {
    void load();
    const ch = supabase
      .channel("site-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "site_change_batches" }, () =>
        load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);
  const expand = async (id: string) => {
    setOpen(open === id ? null : id);
    if (rows[id]) return;
    const { data } = await db
      .from("site_changes")
      .select("*")
      .eq("batch_id", id)
      .order("seo", { ascending: false });
    setRows((r) => ({ ...r, [id]: data ?? [] }));
  };

  const all = batches ?? [];
  const list = all.filter((b) => (show === "all" || !b.reviewed_at) && (!site || b.site === site));
  const open7 = (s: string) =>
    all.filter(
      (b) =>
        b.site === s && b.by_whom === "klant" && Date.parse(b.created_at) > Date.now() - 7 * 864e5,
    );
  const sites = useMemo(() => [...new Set(all.map((b) => b.site))], [all]);

  const review = async (b: Batch, done = true) => {
    const at = done ? new Date().toISOString() : null;
    setBatches((xs) => (xs ?? []).map((x) => (x.id === b.id ? { ...x, reviewed_at: at } : x)));
    const { error } = await db
      .from("site_change_batches")
      .update({ reviewed_at: at })
      .eq("id", b.id);
    if (error) {
      toast.error(error.message);
      void load();
    }
  };
  const reviewAll = async () => {
    const ids = list.filter((b) => !b.reviewed_at).map((b) => b.id);
    if (!ids.length) return;
    const at = new Date().toISOString();
    setBatches((xs) => (xs ?? []).map((x) => (ids.includes(x.id) ? { ...x, reviewed_at: at } : x)));
    const { error } = await db
      .from("site_change_batches")
      .update({ reviewed_at: at })
      .in("id", ids);
    if (error) {
      toast.error(error.message);
      void load();
    } else toast.success(`${ids.length} nagekeken`);
  };
  const undo = useServerFn(undoSiteChange);
  const doUndo = async (b: Batch) => {
    if (
      !window.confirm(
        `De website van ${nameOf(b.site)} terugzetten naar hoe ze was vóór deze ${b.changes} ${b.changes === 1 ? "aanpassing" : "aanpassingen"} (${stamp(b.created_at)})? Latere aanpassingen gaan dan ook weg.`,
      )
    )
      return;
    try {
      await undo({ data: { batchId: b.id } });
      toast.success("Teruggedraaid: de site staat weer zoals ervoor");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Terugdraaien lukte niet");
    }
  };
  const unreviewed = all.filter((b) => !b.reviewed_at).length;

  return (
    <div className="p-4 md:p-6 max-w-6xl 3xl:max-w-[1500px] mx-auto space-y-4">
      <header>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
          <History className="w-6 h-6 shrink-0" /> Wijzigingen
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Wat klanten zelf aanpassen op hun website: waar, wat en hoe. Je krijgt hier geen melding
          per aanpassing; alleen rode vlaggen (SEO, contactgegevens, veel tekst weg, te veel ineens)
          komen in je meldingen en mail.
        </p>
      </header>

      {sites.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          {sites.map((s) => {
            const w = open7(s),
              flagged = w.filter((b) => b.flags.length).length,
              todo = all.filter((b) => b.site === s && !b.reviewed_at).length;
            const color = colors[all.find((b) => b.site === s)?.client_id ?? ""] ?? "#8A93A6";
            return (
              <button
                key={s}
                type="button"
                onClick={() => setSite(site === s ? "" : s)}
                aria-pressed={site === s}
                className={`press text-left rounded-2xl border p-3 ${site === s ? "border-foreground/50 bg-muted/50" : "border-border bg-card"}`}
              >
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                  {nameOf(s)}
                </span>
                <span className="block text-xs text-muted-foreground mt-1">
                  {w.reduce((n, b) => n + b.changes, 0)} aanpassingen · 7 dagen
                </span>
                <span className="mt-1.5 flex flex-wrap gap-1 text-[11px]">
                  {todo > 0 && (
                    <span className="rounded-full bg-sky-500/15 text-sky-300 px-1.5 py-px">
                      {todo} te bekijken
                    </span>
                  )}
                  {flagged > 0 && (
                    <span className="rounded-full bg-amber-500/15 text-amber-300 px-1.5 py-px inline-flex items-center gap-0.5">
                      <AlertTriangle className="w-3 h-3" />
                      {flagged}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-full border border-border p-0.5 text-sm">
          {(["open", "all"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setShow(v)}
              className={`px-3 h-8 rounded-full ${show === v ? "bg-foreground text-background" : "text-muted-foreground"}`}
            >
              {v === "open" ? `Te bekijken${unreviewed ? ` (${unreviewed})` : ""}` : "Alles"}
            </button>
          ))}
        </div>
        {site && (
          <button
            type="button"
            onClick={() => setSite("")}
            className="h-8 rounded-full border border-border px-3 text-xs"
          >
            Alleen {nameOf(site)} · wis
          </button>
        )}
        {show === "open" && list.some((b) => !b.reviewed_at) && (
          <button
            type="button"
            onClick={reviewAll}
            className="ml-auto h-8 rounded-full border border-border px-3 text-xs inline-flex items-center gap-1 hover:bg-muted"
          >
            <Check className="w-3.5 h-3.5" />
            Alles nagekeken
          </button>
        )}
      </div>

      {batches === null ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Laden…</p>
      ) : list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <p className="font-medium">
            {show === "open" ? "Niets te bekijken" : "Nog geen wijzigingen"}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Zodra een klant iets publiceert via zijn beheerpagina, staat het hier.
          </p>
        </div>
      ) : (
        <ol className="space-y-2">
          {list.map((b) => {
            const expanded = open === b.id,
              color = colors[b.client_id ?? ""] ?? "#8A93A6";
            return (
              <li
                key={b.id}
                className={`rounded-2xl border bg-card ${b.flags.length && !b.reviewed_at ? "border-amber-500/50" : "border-border"} ${b.reviewed_at && show === "all" ? "opacity-70" : ""}`}
              >
                <button
                  type="button"
                  onClick={() => expand(b.id)}
                  aria-expanded={expanded}
                  className="w-full text-left p-3 flex items-start gap-3"
                >
                  <span
                    className="w-1 self-stretch rounded-full shrink-0"
                    style={{ background: color }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium">{nameOf(b.site)}</span>
                      <span className="text-sm text-muted-foreground">
                        {b.changes} {b.changes === 1 ? "aanpassing" : "aanpassingen"}
                      </span>
                      {b.flags.map((f) => (
                        <span
                          key={f}
                          className="text-[11px] rounded-full bg-amber-500/15 text-amber-300 px-1.5 py-px inline-flex items-center gap-0.5"
                        >
                          <AlertTriangle className="w-3 h-3" />
                          {FLAG_LABEL[f]}
                        </span>
                      ))}
                      {b.reviewed_at && (
                        <span className="text-[11px] rounded-full bg-emerald-500/15 text-emerald-300 px-1.5 py-px">
                          nagekeken
                        </span>
                      )}
                    </span>
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      {stamp(b.created_at)} · {HOW[b.action]}
                    </span>
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 mt-1 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
                  />
                </button>
                {expanded && (
                  <div className="px-3 pb-3 space-y-2">
                    {!rows[b.id] ? (
                      <p className="text-sm text-muted-foreground">Laden…</p>
                    ) : (
                      <ul className="divide-y divide-border rounded-xl border border-border overflow-hidden">
                        {rows[b.id].map((r) => (
                          <ChangeRow key={r.id} r={r} />
                        ))}
                      </ul>
                    )}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {!b.reviewed_at ? (
                        <button
                          type="button"
                          onClick={() => review(b)}
                          className="h-9 rounded-full bg-foreground text-background px-3 text-xs font-semibold inline-flex items-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Nagekeken
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => review(b, false)}
                          className="h-9 rounded-full border border-border px-3 text-xs inline-flex items-center gap-1"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Terug naar te bekijken
                        </button>
                      )}
                      {b.by_whom === "klant" && (
                        <button
                          type="button"
                          onClick={() => doUndo(b)}
                          className="h-9 rounded-full border border-border px-3 text-xs inline-flex items-center gap-1 hover:bg-muted"
                        >
                          <Undo2 className="w-3.5 h-3.5" />
                          Terugdraaien
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

/** One field: where it is, what it was, what it is now, and why it is flagged. */
function ChangeRow({ r }: { r: Row }) {
  const I = r.kind === "img" ? ImageIcon : r.kind === "contact" ? Phone : FileText;
  const where =
    r.kind === "contact"
      ? r.key
      : [r.page, r.tag ? r.tag.toUpperCase() : null].filter(Boolean).join(" · ") ||
        (r.kind === "img" ? "Foto" : "Tekst");
  return (
    <li className={`p-2.5 text-sm ${r.seo ? "bg-amber-500/[0.06]" : ""}`}>
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
        <I className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate">{where}</span>
        {r.why.length > 0 && (
          <span className="basis-full md:basis-auto md:ml-auto text-amber-300 inline-flex items-center gap-0.5">
            <AlertTriangle className="w-3 h-3" />
            {r.why.join(", ")}
          </span>
        )}
      </div>
      {r.kind === "img" ? (
        <div className="mt-1.5 flex items-center gap-2">
          {r.before && (
            <img
              src={r.before}
              alt="Voor"
              className="w-24 h-16 object-cover rounded-lg opacity-60"
            />
          )}
          <span className="text-muted-foreground">→</span>
          {r.after && (
            <img
              src={r.after}
              alt="Na"
              className="w-24 h-16 object-cover rounded-lg ring-1 ring-emerald-500/50"
            />
          )}
        </div>
      ) : (
        <div className="mt-1 grid md:grid-cols-2 gap-1.5">
          <p className="rounded-lg bg-red-500/[0.07] px-2 py-1.5 line-through decoration-red-400/60 text-muted-foreground whitespace-pre-wrap break-words">
            {r.before || <em>(leeg)</em>}
          </p>
          <p className="rounded-lg bg-emerald-500/[0.08] px-2 py-1.5 whitespace-pre-wrap break-words">
            {r.after || <em className="text-muted-foreground">(leeg)</em>}
          </p>
        </div>
      )}
    </li>
  );
}
