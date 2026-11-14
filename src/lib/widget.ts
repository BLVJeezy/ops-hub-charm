// Data for the iPhone home-screen widget (Scriptable). Totals and site names only:
// no customer names, contact details or invoice lines ever leave the Hub through this.
import { briefingStatus, siteState, totals, type Snapshot } from "./briefing";
import { clientMRR, type FeeClient } from "./fees";

export type WidgetPayload = {
  status: "ok" | "warning" | "critical";
  label: string;
  online: number;
  total: number;
  sites: { name: string; state: "ok" | "warn" | "down"; ms: number | null }[];
  visitors: number;
  visitorsDelta: number | null;
  fresh: number;
  upcoming: number;
  mrr: number;
  openInvoices: number;
  openTotal: number;
  paidThisMonth: number;
  at: string;
};

const LABEL = { ok: "Alles in orde", warning: "Aandacht nodig", critical: "Kritiek" } as const;

export function widgetPayload(
  snap: Snapshot,
  clients: (FeeClient & { status: string | null })[],
  paidThisMonth: number,
  now = new Date(),
): WidgetPayload {
  const sites = snap.sites ?? [];
  const status = briefingStatus(snap);
  const t = totals(snap);
  const before = sites.reduce((a, s) => a + (Number(s.visitors_day_before) || 0), 0);
  return {
    status,
    label: LABEL[status],
    online: sites.filter((s) => siteState(s) !== "down").length,
    total: sites.length,
    sites: sites.map((s) => ({ name: s.name, state: siteState(s), ms: s.last_response_ms ?? null })),
    visitors: t.visitors,
    visitorsDelta: before > 0 ? Math.round(((t.visitors - before) / before) * 100) : null,
    fresh: t.fresh,
    upcoming: t.upcoming,
    mrr: Math.round(clients.filter((c) => c.status === "Active").reduce((a, c) => a + clientMRR(c), 0)),
    openInvoices: t.open,
    openTotal: Math.round(Number(snap.invoices?.open_total) || 0),
    paidThisMonth: Math.round(paidThisMonth),
    at: now.toISOString(),
  };
}
