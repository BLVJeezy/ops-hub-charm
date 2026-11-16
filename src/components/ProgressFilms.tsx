import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { TrendingUp } from "lucide-react";
import { getProgressFilm } from "@/lib/briefing.functions";

type Film = { days: string[]; day: string | null; url: string | null; chapters: { t: number; label: string }[] };

/** The weekly "Solyn Global progress" film: pick a week, play it, jump by chapter. */
export function ProgressFilms() {
  const fetchFilm = useServerFn(getProgressFilm);
  const [film, setFilm] = useState<Film | null>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(0);
  const vref = useRef<HTMLVideoElement>(null);
  const load = (day?: string) => fetchFilm({ data: day ? { day } : {} }).then((r) => { setFilm(r as Film); setNow(0); }).catch(() => setFailed(true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const cur = (film?.chapters ?? []).reduce((a, c, i) => (now >= c.t ? i : a), 0);
  const label = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("nl-BE", { day: "numeric", month: "short" });
  return (
    <section className="space-y-2 md:space-y-3">
      <div>
        <h2 className="text-xl md:text-2xl font-bold tracking-tight flex items-center gap-2"><TrendingUp className="w-5 h-5 shrink-0" /> Solyn Global progress</h2>
        <p className="text-xs text-muted-foreground">Elke maandag: omzet, klanten, bereik en planning in één minuut.</p>
      </div>
      {failed ? <p className="text-sm text-muted-foreground">De films konden niet geladen worden.</p>
        : !film ? <p className="text-sm text-muted-foreground">Laden…</p>
        : !film.day ? <p className="text-sm text-muted-foreground">Nog geen film. De eerste komt maandag.</p>
        : (
          <>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {film.days.map((d) => (
                <button key={d} onClick={() => load(d)} className={`shrink-0 text-xs px-3 min-h-9 rounded-full border ${d === film.day ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}>{label(d)}</button>
              ))}
            </div>
            <div className="grid lg:grid-cols-[1fr_260px] 3xl:grid-cols-[1fr_340px] gap-2 md:gap-4">
              <div className="rounded-xl border border-border bg-black overflow-hidden aspect-video flex items-center justify-center">
                {film.url ? <video key={film.url} ref={vref} src={film.url} controls playsInline className="w-full h-full" onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)} />
                  : <p className="text-sm text-muted-foreground">Video kon niet geladen worden.</p>}
              </div>
              <div className="lg:rounded-xl lg:border lg:border-border lg:bg-card lg:p-2 lg:max-h-[420px] lg:overflow-y-auto flex lg:block gap-1.5 overflow-x-auto pb-1 lg:pb-2">
                <div className="hidden lg:block text-[11px] text-muted-foreground px-2 py-1">Hoofdstukken</div>
                {film.chapters.map((c, i) => (
                  <button key={i} onClick={() => { const v = vref.current; if (v) { v.currentTime = c.t; void v.play(); } }}
                    className={`shrink-0 lg:w-full flex items-center gap-2 text-left text-xs lg:text-sm px-3 lg:px-2 min-h-9 lg:min-h-0 lg:py-1.5 rounded-full lg:rounded-md border border-border lg:border-0 ${i === cur ? "bg-primary/15 text-primary" : "hover:bg-muted/50"}`}>
                    <span className="font-mono text-[11px] text-muted-foreground w-9">{Math.floor(c.t / 60)}:{String(Math.floor(c.t % 60)).padStart(2, "0")}</span>
                    <span className="truncate">{c.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
    </section>
  );
}
