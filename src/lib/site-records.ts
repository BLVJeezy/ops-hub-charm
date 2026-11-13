/** Pure helpers for client-site data bridges (see site-records.server.ts). */

export type BridgeRecord = {
  kind: string;
  external_id: string;
  starts_at: string | null;
  ends_at: string | null;
  status: string | null;
  title: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  message: string | null;
  amount: number | null;
  source: string | null;
  extra: Record<string, unknown>;
  source_created_at: string | null;
};

const str = (v: unknown, n = 500): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s.slice(0, n) : null;
};

const ts = (v: unknown): string | null => {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00Z` : v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/** Validates and cleans what a client site returns; drops rows without kind or id. */
export function normaliseRecords(input: unknown): BridgeRecord[] {
  const list = Array.isArray(input)
    ? input
    : Array.isArray((input as { records?: unknown })?.records)
      ? (input as { records: unknown[] }).records
      : [];
  const out = new Map<string, BridgeRecord>();
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const kind = str(r.kind, 30);
    const external_id = str(r.external_id, 120);
    if (!kind || !external_id) continue;
    const amount = typeof r.amount === "number" && Number.isFinite(r.amount) ? r.amount : null;
    out.set(`${kind}:${external_id}`, {
      kind,
      external_id,
      starts_at: ts(r.starts_at),
      ends_at: ts(r.ends_at),
      status: str(r.status, 40),
      title: str(r.title, 200),
      customer_name: str(r.customer_name, 200),
      customer_email: str(r.customer_email, 200),
      customer_phone: str(r.customer_phone, 60),
      message: str(r.message, 1000),
      amount,
      source: str(r.source, 60),
      extra: r.extra && typeof r.extra === "object" && !Array.isArray(r.extra) ? (r.extra as Record<string, unknown>) : {},
      source_created_at: ts(r.source_created_at),
    });
  }
  return [...out.values()];
}
