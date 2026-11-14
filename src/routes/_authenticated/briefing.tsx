import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Film, Play, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getBriefingVideo } from "@/lib/briefing.functions";
import { siteState, totals, type Snapshot, type SnapSite } from "@/lib/briefing";

type Row = {
  day: string;
  status: "ok" | "warning" | "critical";
  snapshot: Snapshot;
  video_path: string | null;
  chapters: Array<{ t: number; label: string; site_id?: string; state?: string }> | null;
  rendered_at: string | null;
  render_error: string | null;
  created_at: string;
};

export const Route = createFileRoute("/_authenticated/briefing")({
  validateSearch: (s: Record<string, unknown>): { day?: string } => (typeof s.day === "string" ? { day: s.day } : {}),
  component: BriefingPage,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const STATUS = {
  ok: { label: "Alles in orde", cls: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30", Icon: CheckCircle2 },
  warning: { label: "Aandacht nodig", cls: "bg-amber-500/15 text-amber-500 border-amber-500/30", Icon: AlertTriangle },
  critical: { label: "Kritiek", cls: "bg-red-500/15 text-red-500 border-red-500/30", Icon: XCircle },
} as const;
const DOT = { ok: "bg-emerald-500", warn: "bg-amber-500", down: "bg-red-500" } as const;

function BriefingPage() {
  const { day: qDay } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [list, setList] = useState<Row[] | null>(null);
  const fetchVideo = useServerFn(getBriefingVideo);
  const [video, setVideo] = useState<{ url?: string; reason?: string; loading?: boolean }>({});
  const [now, setNow] = useState(0);
  const vref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    db.from("daily_briefings").select("*").order("day", { ascending: false }).limit(30)
      .then(({ data }: { data: Row[] | null }) => setList(data ?? []));
  }, []);
  const row = useMemo(() => (list ?? []).find((r) => r.day === qDay) ?? (list ?? [])[0], [list, qDay]);

  useEffect(() => {
    if (!row) return;
    let url: string | undefined;
    setVideo({ loading: true });
    fetchVideo({ data: { day: row.day } })
      .then((r) => {
        if (!r.ok) return setVideo({ reason: r.reason });
        const bin = atob(r.base64), arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        url = URL.createObjectURL(new Blob([arr], { type: r.mime }));
        setVideo({ url });
      })
      .catch(() => setVideo({ reason: "error" }));
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [row?.day, row?.video_path, fetchVideo]);

  if (list === null) return <div className="p-6 text-sm text-muted-foreground">Laden…</div>;
  if (!row) return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-semibold mb-2">Noon scan</h1>
      <p className="text-sm text-muted-foreground">Nog geen briefing. Elke dag om 11:30 maakt de Hub een momentopname; om 12:00 staat de video hier.</p>
    </div>
  );

  const S = STATUS[row.status] ?? STATUS.ok;
  const T = totals(row.snapshot);
  const chapters = row.chapters ?? [];
  const cur = chapters.reduce((a, c, i) => (now >= c.t ? i : a), 0);
  const seek = (t: number) => { const v = vref.current; if (v) { v.currentTime = t; v.play().catch(() => {}); } };
  const chapterOf = (id: string) => chapters.find((c) => c.site_id === id);
  const sites = [...(row.snapshot.sites ?? [])].sort((a, b) => ["down", "warn", "ok"].indexOf(siteState(a)) - ["down", "warn", "ok"].indexOf(siteState(b)) || (b.visitors_yesterday ?? 0) - (a.visitors_yesterday ?? 0));

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-3 md:space-y-4">
      <div className="flex items-center gap-3 justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2"><Film className="w-6 h-6 shrink-0" /> Noon scan</h1>
          <p className="text-xs text-muted-foreground truncate">
            {new Date(`${row.day}T12:00:00Z`).toLocaleDateString("nl-BE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · momentopname {new Date(row.created_at).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels" })}
          </p>
        </div>
        <span className={`shrink-0 inline-flex items-center gap-1.5 text-xs md:text-sm px-2.5 md:px-3 py-1 rounded-full border ${S.cls}`}><S.Icon className="w-4 h-4" />{S.label}</span>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {list.map((r) => (
          <button key={r.day} onClick={() => navigate({ search: { day: r.day } })}
            className={`shrink-0 text-xs px-2.5 py-1 rounded-full border flex items-center gap-1.5 ${r.day === row.day ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${r.status === "critical" ? "bg-red-500" : r.status === "warning" ? "bg-amber-500" : "bg-emerald-500"}`} />
            {new Date(`${r.day}T12:00:00Z`).toLocaleDateString("nl-BE", { day: "numeric", month: "short" })}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-[1fr_260px] gap-2 md:gap-4">
        <div className={`rounded-xl border overflow-hidden aspect-video flex items-center justify-center ${video.url ? "border-border bg-black" : `tone ${row.status === "critical" ? "tone-red" : row.status === "warning" ? "tone-amber" : "tone-emerald"}`}`}>
          {video.url ? (
            <video ref={vref} src={video.url} controls playsInline className="w-full h-full" onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)} />
          ) : (
            <p className="text-sm text-muted-foreground px-6 text-center">
              {video.loading ? "Video laden…"
                : video.reason === "no-video" ? (row.render_error ? `De video kon niet gemaakt worden: ${row.render_error}` : "De video van vandaag wordt nog gemaakt (klaar rond 12:00).")
                : video.reason === "no-token" ? "Video staat klaar, maar de Hub mist het geheim GITHUB_TOKEN om hem te tonen."
                : "Video kon niet geladen worden."}
            </p>
          )}
        </div>
        <div className="lg:rounded-xl lg:border lg:border-border lg:bg-card lg:p-2 lg:max-h-[420px] lg:overflow-y-auto flex lg:block gap-1.5 overflow-x-auto pb-1 lg:pb-2">
          <div className="hidden lg:block text-[11px] text-muted-foreground px-2 py-1">Hoofdstukken</div>
          {chapters.length ? chapters.map((c, i) => (
            <button key={i} onClick={() => seek(c.t)} disabled={!video.url}
              className={`shrink-0 lg:w-full flex items-center gap-2 text-left text-xs lg:text-sm px-2.5 lg:px-2 py-1 lg:py-1.5 rounded-full lg:rounded-md border border-border lg:border-0 ${i === cur && video.url ? "bg-primary/15 text-primary" : "hover:bg-muted"} disabled:opacity-50`}>
              <span className="font-mono text-[11px] text-muted-foreground w-9">{Math.floor(c.t / 60)}:{String(Math.floor(c.t % 60)).padStart(2, "0")}</span>
              {c.state && <span className={`w-1.5 h-1.5 rounded-full ${DOT[c.state as keyof typeof DOT] ?? "bg-muted"}`} />}
              <span className="truncate">{c.label}</span>
            </button>
          )) : <p className="text-xs text-muted-foreground px-2">Komt met de video.</p>}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <Kpi label="Bezoekers gisteren" short="gisteren" value={T.visitors} tone="tone-sky" />
        <Kpi label="Bezoekers 7 dagen" short="7 dagen" value={T.week} />
        <Kpi label="Nieuwe aanvragen 24u" short="nieuw 24u" value={T.fresh} tone={T.fresh ? "tone-violet" : ""} />
        <Kpi label="Facturen te laat" short="te laat" value={T.overdue} warn={T.overdue > 0} tone={T.overdue ? "tone-red" : ""} />
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-3">
        {sites.map((s) => <SiteCard key={s.id} s={s} chapter={chapterOf(s.id)} onPlay={video.url ? seek : undefined} />)}
      </div>
    </div>
  );
}

function Kpi({ label, short, value, warn, tone = "" }: { label: string; short: string; value: number; warn?: boolean; tone?: string }) {
  return (
    <div className={`rounded-xl border bg-card px-2.5 py-2 md:p-3 ${tone ? `tone ${tone}` : "border-border"}`} title={label}>
      <div className={`text-xl md:text-2xl font-bold tabular-nums ${warn ? "text-red-400" : ""}`}>{value}</div>
      <div className="text-[10px] md:text-[11px] text-muted-foreground truncate"><span className="md:hidden">{short}</span><span className="hidden md:inline">{label}</span></div>
    </div>
  );
}

function SiteCard({ s, chapter, onPlay }: { s: SnapSite; chapter?: { t: number }; onPlay?: (t: number) => void }) {
  const st = siteState(s);
  const d = (s.visitors_yesterday ?? 0) - (s.visitors_day_before ?? 0);
  const open = (s.incidents ?? []).filter((i) => i.status === "open");
  return (
    <div className="rounded-xl border border-border bg-card px-3.5 py-2.5 sm:p-3 space-y-1 sm:space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Link to="/status/$id" params={{ id: s.id }} className="font-medium flex items-center gap-2 hover:underline">
          <span className={`w-2 h-2 rounded-full ${DOT[st]}`} />{s.name}
        </Link>
        {chapter && onPlay && (
          <button onClick={() => onPlay(chapter.t)} className="text-xs text-primary flex items-center gap-1"><Play className="w-3 h-3" />in video</button>
        )}
      </div>
      <div className="sm:hidden flex items-center justify-between gap-2 text-[11px] text-muted-foreground tabular-nums">
        <span><b className="text-foreground font-semibold">{s.uptime24 != null ? `${Number(s.uptime24).toFixed(1)}%` : "—"}</b> uptime</span>
        <span><b className="text-foreground font-semibold">{s.visitors_yesterday ?? 0}</b> bezoekers{d ? <span className={d > 0 ? "text-emerald-400" : "text-red-400"}> {d > 0 ? "▲" : "▼"}{Math.abs(d)}</span> : ""}</span>
        <span><b className="text-foreground font-semibold">{s.new_24h ?? 0}</b> nieuw</span>
        <span><b className="text-foreground font-semibold">{s.upcoming_7d ?? 0}</b> geboekt</span>
      </div>
      <div className="hidden sm:grid grid-cols-3 gap-2 text-center">
        <Mini label="Uptime 24u" value={s.uptime24 != null ? `${Number(s.uptime24).toFixed(1)}%` : "—"} />
        <Mini label="Bezoekers" value={`${s.visitors_yesterday ?? 0}`} sub={d ? `${d > 0 ? "▲" : "▼"} ${Math.abs(d)}` : "="} />
        <Mini label="Nieuw 24u" value={`${s.new_24h ?? 0}`} />
      </div>
      <div className="hidden sm:flex text-[11px] text-muted-foreground justify-between">
        <span>Respons {s.last_response_ms != null ? `${(s.last_response_ms / 1000).toFixed(2)} s` : "—"}</span>
        <span>{s.upcoming_7d ?? 0} geboekt komende 7 d</span>
      </div>
      {open.length > 0 && <div className="text-xs text-red-500">{open.map((i) => i.title).join(" · ")}</div>}
    </div>
  );
}

function Mini({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-muted/40 py-1.5">
      <div className="text-base font-semibold">{value}{sub && <span className="text-[10px] text-muted-foreground ml-1">{sub}</span>}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}
