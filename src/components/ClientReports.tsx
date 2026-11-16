import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Download } from "lucide-react";
import { getClientReport } from "@/lib/briefing.functions";

type Report = { days: string[]; day: string | null; url: string | null; download: string | null };

/** The client's monthly report films: play one, or download it to send to the client. */
export function ClientReports({ clientId }: { clientId: string }) {
  const fetchReport = useServerFn(getClientReport);
  const [rep, setRep] = useState<Report | null>(null);
  const [failed, setFailed] = useState(false);
  const load = (day?: string) => fetchReport({ data: day ? { clientId, day } : { clientId } }).then((r) => setRep(r as Report)).catch(() => setFailed(true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setRep(null); setFailed(false); load(); }, [clientId]);
  const label = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("nl-BE", { day: "numeric", month: "short", year: "numeric" });
  return (
    <div className="card p-5 mb-4">
      <div className="flex items-center justify-between mb-3 gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Maandrapport (video)</h2>
        {rep?.download && <a href={rep.download} className="inline-flex items-center gap-1.5 text-xs font-medium rounded-full border border-border px-3 min-h-9 hover:bg-muted/50"><Download className="w-3.5 h-3.5" />Download voor de klant</a>}
      </div>
      {failed ? <p className="text-sm text-muted-foreground">De rapporten konden niet geladen worden.</p>
        : !rep ? <p className="text-sm text-muted-foreground">Laden…</p>
        : !rep.day ? <p className="text-sm text-muted-foreground">Nog geen rapport. Op de eerste van de maand komt de video van de voorbije maand hier.</p>
        : (
          <div className="space-y-3">
            {rep.days.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {rep.days.map((d) => <button key={d} onClick={() => load(d)} className={`shrink-0 text-xs px-3 min-h-9 rounded-full border ${d === rep.day ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}>t/m {label(d)}</button>)}
              </div>
            )}
            <div className="rounded-xl border border-border bg-black overflow-hidden aspect-video max-w-3xl">
              {rep.url ? <video key={rep.url} src={rep.url} controls playsInline className="w-full h-full" /> : <p className="text-sm text-muted-foreground p-6">Video kon niet geladen worden.</p>}
            </div>
            <p className="text-xs text-muted-foreground">Periode t/m {label(rep.day)}. Enkel aantallen, geen namen of gegevens van hun klanten.</p>
          </div>
        )}
    </div>
  );
}
