// What the owner should hear about without opening the Hub: invoices open too long, sites offline, clients behind on their videos.
// Pure: the Brain shows these, and the daily job mails them (see owner-alerts.server.ts).

export type AlertKind = "invoice" | "site" | "videos" | "leads";
export type OwnerAlert = { kind: AlertKind; key: string; clientId: string | null; title: string; detail: string; /** worth an e-mail today */ mail: boolean };

type Inv = { id: string; client?: string | null; client_name?: string | null; total?: number | string | null; status?: string | null; sent_at?: string | null; invoice_number?: number | null };
type Cli = { id: string; name: string; status?: string | null; is_internal?: boolean | null; social_videos_per_month?: number | null; social_start_date?: string | null; social_end_date?: string | null };
type Vid = { client_id: string; month: string; sent_at?: string | null };
type Site = { id: string; name: string; client_id?: string | null; last_status?: string | null };
type Rec = { site_id: string; kind: string; source_created_at?: string | null; starts_at?: string | null };
const KIND: Record<string, [string, string]> = { aanvraag: ["nieuwe aanvraag", "nieuwe aanvragen"], afspraak: ["nieuwe afspraak", "nieuwe afspraken"], reservatie: ["nieuwe reservatie", "nieuwe reservaties"], bestelling: ["nieuwe bestelling", "nieuwe bestellingen"], lead: ["nieuwe lead", "nieuwe leads"] };

export const OPEN_DAYS = 14;
const dayMs = 864e5;
const euro = (n: number) => new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

/** Videos a client should have received by this day of the month, counted evenly over the month (from the start date in the first month). */
export function videosExpected(perMonth: number, today: string, startDate?: string | null): number {
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7)), d = Number(today.slice(8, 10));
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const first = startDate && startDate.slice(0, 7) === today.slice(0, 7) ? Number(startDate.slice(8, 10)) : 1;
  if (startDate && startDate > today) return 0;
  return Math.floor((perMonth * Math.max(0, d - first + 1)) / (dim - first + 1));
}

export function ownerAlerts(input: { invoices: Inv[]; clients: Cli[]; videos: Vid[]; sites: Site[]; today: string; records?: Rec[]; /** records made after this moment count as new (ISO) */ since?: string }): OwnerAlert[] {
  const { invoices, clients, videos, sites, today } = input;
  const out: OwnerAlert[] = [];
  const now = new Date(today + "T12:00:00Z").getTime(), weekday = new Date(today + "T12:00:00Z").getUTCDay(), dom = Number(today.slice(8, 10));

  for (const s of sites) if (s.last_status === "down") out.push({ kind: "site", key: `site:${s.id}`, clientId: s.client_id ?? null, title: `${s.name} is offline`, detail: "Bekijk de Status-pagina", mail: false });   // the monitor mails this itself, within minutes

  for (const v of invoices) {
    if (v.status !== "Sent" || !v.sent_at) continue;
    const age = Math.floor((now - new Date(v.sent_at.slice(0, 10) + "T12:00:00Z").getTime()) / dayMs);
    if (age < OPEN_DAYS) continue;
    out.push({ kind: "invoice", key: `invoice:${v.id}`, clientId: v.client ?? null, title: `${v.client_name ?? "Factuur"}: ${euro(Number(v.total || 0))} staat ${age} dagen open`, detail: "Bel of stuur een herinnering", mail: (age - OPEN_DAYS) % 7 === 0 });
  }

  for (const c of clients) {
    const n = Number(c.social_videos_per_month || 0);
    if (!n || c.is_internal || c.status !== "Active" || (c.social_end_date && c.social_end_date < today)) continue;
    const sent = videos.filter((x) => x.client_id === c.id && x.month.slice(0, 7) === today.slice(0, 7) && x.sent_at).length;
    const gap = videosExpected(n, today, c.social_start_date) - sent;
    if (gap < 2) continue;
    out.push({ kind: "videos", key: `videos:${c.id}`, clientId: c.id, title: `${c.name.replace(/\s*\(.*\)$/, "")}: ${gap} video's achter`, detail: `${sent} van ${n} verstuurd deze maand`, mail: weekday === 1 || dom === 25 });
  }

  // what came in through the client sites since the last look: this replaces checking the leads by hand
  if (input.records && input.since) {
    for (const s of sites) {
      const fresh = input.records.filter((r) => r.site_id === s.id && r.kind !== "blokkade" && (r.source_created_at ?? r.starts_at ?? "") >= input.since!);
      if (!fresh.length) continue;
      const kinds = [...new Set(fresh.map((r) => r.kind))];
      const parts = kinds.map((k) => { const n = fresh.filter((r) => r.kind === k).length; return `${n} ${KIND[k]?.[n === 1 ? 0 : 1] ?? k}`; });
      out.push({ kind: "leads", key: `leads:${s.id}`, clientId: s.client_id ?? null, title: `${s.name}: ${parts.join(", ")}`, detail: "sinds gisteren", mail: true });
    }
  }
  return out;
}
