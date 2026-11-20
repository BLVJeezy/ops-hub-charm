import { fromResend, pending, type MailStatus } from "./client-email";

type Send = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  attachments?: { filename: string; content: string }[];
  tags?: { name: string; value: string }[];
  kind: string;
  clientId?: string | null;
  refId?: string | null;
};

/**
 * Sends a mail to a client through Resend and records it, so the Hub can show whether it arrived.
 * Returns Resend's id (or null when sending failed); the record is kept either way.
 */

export async function sendClientEmail(
  db: any,
  m: Send,
): Promise<{ ok: boolean; id: string | null; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, id: null, error: "mail is niet ingesteld" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      from: m.from || process.env.BOOKING_EMAIL_FROM || "Solyn Global <status@solynglobal.be>",
      to: [m.to],
      reply_to: m.replyTo || process.env.ALERT_EMAIL_TO || "jason@solynglobal.be",
      subject: m.subject,
      html: m.html,
      ...(m.text ? { text: m.text } : {}),
      ...(m.attachments ? { attachments: m.attachments } : {}),
      ...(m.tags ? { tags: m.tags } : {}),
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  await recordClientEmail(db, {
    resendId: res.ok ? (body.id ?? null) : null,
    to: m.to,
    subject: m.subject,
    kind: m.kind,
    clientId: m.clientId ?? null,
    refId: m.refId ?? null,
    failed: !res.ok,
    error: res.ok ? null : (body.message ?? `HTTP ${res.status}`),
  });
  return res.ok
    ? { ok: true, id: body.id ?? null }
    : { ok: false, id: null, error: body.message ?? `HTTP ${res.status}` };
}

/** Records a mail that was sent elsewhere (with its Resend id). Never throws. */

export async function recordClientEmail(
  db: any,
  r: {
    resendId: string | null;
    to: string;
    subject: string;
    kind: string;
    clientId?: string | null;
    refId?: string | null;
    failed?: boolean;
    error?: string | null;
  },
) {
  try {
    await db.from("client_emails").insert({
      resend_id: r.resendId,
      to_email: r.to,
      subject: r.subject.slice(0, 300),
      kind: r.kind,
      client_id: r.clientId ?? null,
      ref_id: r.refId ?? null,
      status: r.failed ? "failed" : "sent",
      error: r.error ?? null,
      status_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[client-email] record", e instanceof Error ? e.message : e);
  }
}

/**
 * Asks Resend what happened to each recent mail that is not final yet, and stores it.
 * Also copies delivered/opened/bounced onto the invoice it belongs to.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function syncEmailStatus(db: any, limit = 60) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { checked: 0, changed: 0 };
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const cols = "id, resend_id, status, sent_at, kind, ref_id";
  // Recent mails keep being followed; older ones are checked at least once.
  const [recent, never] = await Promise.all([
    db
      .from("client_emails")
      .select(cols)
      .not("resend_id", "is", null)
      .in("status", ["sent", "delayed", "delivered"])
      .gte("sent_at", since)
      .order("checked_at", { ascending: true, nullsFirst: true })
      .limit(limit),
    db
      .from("client_emails")
      .select(cols)
      .not("resend_id", "is", null)
      .is("checked_at", null)
      .limit(limit),
  ]);
  const seen = new Set<string>();
  const data = [...(recent.data ?? []), ...(never.data ?? [])]
    .filter((r) => !seen.has(r.id) && seen.add(r.id))
    .slice(0, limit);
  let changed = 0;
  for (const row of (data ?? []) as {
    id: string;
    resend_id: string;
    status: MailStatus;
    sent_at: string;
    kind: string;
    ref_id: string | null;
  }[]) {
    if (!pending(row.status, row.sent_at)) continue;
    const r = await fetch(`https://api.resend.com/emails/${encodeURIComponent(row.resend_id)}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    const now = new Date().toISOString();
    if (!r.ok) {
      await db.from("client_emails").update({ checked_at: now }).eq("id", row.id);
      continue;
    }
    const e = (await r.json().catch(() => ({}))) as { last_event?: string };
    const next = fromResend(e.last_event, row.status);
    const patch: Record<string, string> = { checked_at: now };
    if (next !== row.status) {
      changed++;
      patch.status = next;
      patch.status_at = now;
      if (next === "delivered" || next === "opened" || next === "clicked") patch.delivered_at = now;
      if (next === "opened" || next === "clicked") patch.opened_at = now;
      if (next === "bounced" || next === "complained") patch.bounced_at = now;
      if (row.ref_id && (row.kind === "factuur" || row.kind === "herinnering")) {
        const inv: Record<string, string> = { email_status: next };
        if (patch.delivered_at) inv.delivered_at = now;
        if (patch.opened_at) inv.opened_at = now;
        if (next === "bounced") inv.bounced_at = now;
        if (next === "complained") inv.complained_at = now;
        await db.from("invoices").update(inv).eq("resend_message_id", row.resend_id);
      }
    }
    await db.from("client_emails").update(patch).eq("id", row.id);
  }
  return { checked: (data ?? []).length, changed };
}
