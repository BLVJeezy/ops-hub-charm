import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ExternalLink, Inbox, PencilRuler } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SITES } from "@/lib/beheer-sites";
import { isOpen, type Status } from "@/lib/client-requests";

export const Route = createFileRoute("/_authenticated/klantbeheer")({ component: KlantbeheerPage });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
type Row = {
  slug: string;
  liveAt: string | null;
  lastSaved: string | null;
  publishes30: number;
  open: number;
};

const ago = (iso: string | null) => {
  if (!iso) return "nog nooit";
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86400000);
  if (d <= 0) return "vandaag";
  if (d === 1) return "gisteren";
  if (d < 30) return `${d} dagen geleden`;
  return new Date(iso).toLocaleDateString("nl-BE", { day: "numeric", month: "short", year: "numeric" });
};

/** Per client website: when the client last published or saved in their beheer, and how many requests are open. */
function KlantbeheerPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    (async () => {
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      const [live, vers, reqs] = await Promise.all([
        db.from("beheer_content").select("site, published_at"),
        db.from("beheer_versions").select("site, kind, created_at").gte("created_at", since).limit(2000),
        db.from("client_requests").select("client_id, status").limit(2000),
      ]);
      const liveBy = new Map<string, string>(((live.data ?? []) as { site: string; published_at: string }[]).map((x) => [x.site, x.published_at]));
      const v = (vers.data ?? []) as { site: string; kind: string; created_at: string }[];
      const r = (reqs.data ?? []) as { client_id: string; status: Status }[];
      setRows(
        Object.entries(SITES).map(([slug, s]) => {
          const mine = v.filter((x) => x.site === slug);
          const saved = mine.filter((x) => x.kind === "saved").map((x) => x.created_at).sort().pop() ?? null;
          return {
            slug,
            liveAt: liveBy.get(slug) ?? null,
            lastSaved: saved,
            publishes30: mine.filter((x) => x.kind !== "saved").length,
            open: s.clientId ? r.filter((x) => x.client_id === s.clientId && isOpen(x.status)).length : 0,
          };
        }),
      );
    })();
  }, []);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex items-center gap-3">
        <PencilRuler className="h-5 w-5" />
        <h1 className="text-xl font-semibold">Klantbeheer</h1>
        <span className="text-sm text-muted-foreground">wie past zelf zijn website aan</span>
      </div>
      {rows === null ? (
        <p className="text-sm text-muted-foreground">Laden…</p>
      ) : (
        <ol className="grid gap-3 sm:grid-cols-2">
          {rows.map((r) => {
            const s = SITES[r.slug];
            return (
              <li key={r.slug} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start gap-2">
                  <h2 className="flex-1 font-semibold">{s.name}</h2>
                  {r.open > 0 && (
                    <Link to="/aanvragen" className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400">
                      <Inbox className="h-3.5 w-3.5" /> {r.open} open
                    </Link>
                  )}
                  {!s.clientId && <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">geen Hub-klant</span>}
                </div>
                <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                  <dt className="text-muted-foreground">Laatst gepubliceerd</dt>
                  <dd>{ago(r.liveAt)}</dd>
                  <dt className="text-muted-foreground">Publicaties (30 d)</dt>
                  <dd className="tabular-nums">{r.publishes30}</dd>
                  <dt className="text-muted-foreground">Laatst bewaard</dt>
                  <dd>{ago(r.lastSaved)}</dd>
                </dl>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a href={s.beheer} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 text-sm font-medium text-background">
                    <PencilRuler className="h-4 w-4" /> Open beheer
                  </a>
                  <a href={s.home} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm">
                    <ExternalLink className="h-4 w-4" /> Website
                  </a>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
