// Server-only: sends scheduled invoices and creates + sends monthly repeats.
// Runs from the daily invoice job (/api/public/hooks/invoice-reminders).
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/integrations/supabase/types'
import { deliverInvoice } from '@/lib/invoice-mail.server'
import { addDays, advanceMonthNames, brusselsToday, isDueAt } from '@/lib/invoice-schedule'
import { formatInvoiceNumber } from '@/lib/invoice-code'

type Db = SupabaseClient<Database>
// New columns are not in the generated types until Lovable regenerates them.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const untyped = (db: Db) => db as any

const LOCK_MINUTES = 15

export type ScheduleSummary = { scheduledSent: number; repeatsSent: number; failed: Array<{ id: string; error: string }> }

/** Atomically claim a row so two overlapping runs never send the same invoice twice. */
async function claim(db: Db, id: string, col: string, val: string | boolean): Promise<boolean> {
  const staleBefore = new Date(Date.now() - LOCK_MINUTES * 60_000).toISOString()
  const { data } = await untyped(db)
    .from('invoices')
    .update({ schedule_locked_at: new Date().toISOString() })
    .eq('id', id)
    .or(`schedule_locked_at.is.null,schedule_locked_at.lt.${staleBefore}`)
    .eq(col, val)
    .select('id')
  return Array.isArray(data) && data.length === 1
}

async function fail(db: Db, id: string, err: unknown, summary: ScheduleSummary, label: string, retryOn?: string) {
  const msg = err instanceof Error ? err.message : String(err)
  summary.failed.push({ id, error: msg })
  // Retry once a day (same hour), not every hourly run.
  const patch: Record<string, unknown> = { schedule_error: msg, schedule_locked_at: null }
  if (retryOn) patch.scheduled_send_at = retryOn
  await untyped(db).from('invoices').update(patch).eq('id', id)
  await alertJason(`Geplande factuur niet verstuurd: ${label}`, msg)
}

export async function processScheduledInvoices(db: Db, now: Date = new Date()): Promise<ScheduleSummary> {
  const today = brusselsToday(now)
  const summary: ScheduleSummary = { scheduledSent: 0, repeatsSent: 0, failed: [] }

  // 1. One-off scheduled drafts whose day has come.
  const { data: due } = await untyped(db)
    .from('invoices')
    .select('id, invoice_number, client_name, scheduled_send_at, scheduled_send_hour')
    .eq('status', 'Draft')
    .not('scheduled_send_at', 'is', null)
    .lte('scheduled_send_at', today)
  type Due = { id: string; invoice_number: number | null; client_name: string | null; scheduled_send_at: string; scheduled_send_hour: number | null }
  for (const inv of ((due ?? []) as Due[]).filter((d) => isDueAt(d.scheduled_send_at, d.scheduled_send_hour, now))) {
    if (!(await claim(db, inv.id, 'status', 'Draft'))) continue
    try {
      // The invoice date (and so the 7-day due date on the PDF) is the day it is actually sent.
      await untyped(db).from('invoices').update({ date: today }).eq('id', inv.id)
      await deliverInvoice(db, inv.id)
      summary.scheduledSent++
    } catch (e) {
      await fail(db, inv.id, e, summary, `${formatInvoiceNumber(inv.invoice_number)} · ${inv.client_name ?? ''}`, addDays(today, 1))
    }
  }

  // 2. Monthly repeats: copy the last sent invoice, send the copy, move the repeat onto it.
  const { data: repeats } = await untyped(db)
    .from('invoices')
    .select('*')
    .eq('repeat_monthly', true)
    .in('status', ['Sent', 'Paid'])
    .not('next_repeat_on', 'is', null)
    .lte('next_repeat_on', today)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const src of ((repeats ?? []) as Array<Record<string, any>>).filter((r) => isDueAt(r.next_repeat_on, r.repeat_hour, now))) {
    if (!(await claim(db, src.id, 'repeat_monthly', true))) continue

    const lineItems = Array.isArray(src.line_items)
      ? src.line_items.map((l: Record<string, unknown>) => ({
          ...l,
          description: typeof l.description === 'string' ? advanceMonthNames(l.description) : l.description,
        }))
      : src.line_items

    // Hand the repeat over first, so a failure below can never create a second copy tomorrow.
    await untyped(db)
      .from('invoices')
      .update({ repeat_monthly: false, next_repeat_on: null, schedule_locked_at: null })
      .eq('id', src.id)

    const { data: created, error: insErr } = await untyped(db)
      .from('invoices')
      .insert({
        client: src.client,
        client_name: src.client_name,
        client_address: src.client_address,
        client_vat_number: src.client_vat_number,
        date: today,
        line_items: lineItems,
        vat_note: src.vat_note,
        total: src.total,
        status: 'Draft',
        repeat_monthly: true,
        repeat_day: src.repeat_day,
        repeat_hour: src.repeat_hour,
        repeat_parent: src.id,
        created_by: src.created_by,
      })
      .select('id, invoice_number')
      .single()

    if (insErr || !created) {
      // Put the repeat back on the source so it is retried tomorrow.
      await untyped(db)
        .from('invoices')
        .update({ repeat_monthly: true, next_repeat_on: src.next_repeat_on })
        .eq('id', src.id)
      await fail(db, src.id, insErr ?? new Error('insert failed'), summary, `herhaling van ${formatInvoiceNumber(src.invoice_number)} · ${src.client_name ?? ''}`)
      continue
    }

    try {
      await deliverInvoice(db, created.id) // also sets next_repeat_on on the new invoice
      summary.repeatsSent++
    } catch (e) {
      // Keep the new draft and retry it tomorrow as a one-off scheduled send.
      await untyped(db)
        .from('invoices')
        .update({ scheduled_send_at: addDays(today, 1), scheduled_send_hour: src.repeat_hour })
        .eq('id', created.id)
      await fail(db, created.id, e, summary, `${formatInvoiceNumber(created.invoice_number)} · ${src.client_name ?? ''}`)
    }
  }

  return summary
}

async function alertJason(subject: string, detail: string) {
  const key = process.env.RESEND_API_KEY
  if (!key) return
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        from: process.env.ALERT_EMAIL_FROM || 'Solyn Status <status@solynglobal.be>',
        to: [process.env.ALERT_EMAIL_TO || 'jason@solynglobal.be'],
        subject,
        text: `${subject}\n\n${detail}\n\nDe factuur staat nog als Draft in Hub OS en wordt morgen opnieuw geprobeerd.`,
      }),
    })
  } catch {
    /* alerting must never break the run */
  }
}
