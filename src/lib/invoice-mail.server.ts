// Server-only: build the invoice email + PDF and send it through Resend.
// Shared by the "Verstuur" button (user's client, RLS applies) and the
// daily scheduler (service-role client).
import * as React from 'react'
import { render } from '@react-email/render'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/integrations/supabase/types'
import { template as invoiceTemplate } from '@/lib/email-templates/invoice-email'
import { formatInvoiceNumber } from '@/lib/invoice-code'
import { brusselsToday, dayOf, nextMonthlyDate } from '@/lib/invoice-schedule'

function fmtEUR(n: number) {
  return new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' }).format(n || 0)
}

function fmtDate(d: string) {
  try {
    const date = new Date(d)
    const dd = String(date.getDate()).padStart(2, '0')
    const mm = String(date.getMonth() + 1).padStart(2, '0')
    return `${dd}-${mm}-${date.getFullYear()}`
  } catch {
    return d
  }
}

export type DeliverResult = { ok: true; messageId: string | null; to: string; isReminder: boolean }

export async function deliverInvoice(
  supabase: SupabaseClient<Database>,
  invoiceId: string,
  opts: { isReminder?: boolean } = {},
): Promise<DeliverResult> {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('RESEND_API_KEY not configured')

  const { data: inv, error } = await supabase.from('invoices').select('*').eq('id', invoiceId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!inv) throw new Error('Invoice not found')

  let toEmail: string | null = null
  let clientRow: { name?: string; billing_address?: string | null; vat_number?: string | null; contact_email?: string | null } | null = null
  if (inv.client) {
    const { data: c } = await supabase
      .from('clients')
      .select('name, billing_address, vat_number, contact_email')
      .eq('id', inv.client)
      .maybeSingle()
    clientRow = c
    toEmail = c?.contact_email?.trim() || null
  }
  if (!toEmail) throw new Error('Klant heeft geen e-mailadres')

  const items = Array.isArray(inv.line_items)
    ? (inv.line_items as Array<{ description: string; amount?: number; note?: string }>).map((i) => ({
        description: i.description,
        price: fmtEUR(Number(i.amount || 0)),
        note: i.note || inv.vat_note || 'BTW (0% - Reverse Charge)',
      }))
    : []

  const isReminder = !!opts.isReminder
  const reminderCount = (inv.reminder_count || 0) + (isReminder ? 1 : 0)
  const publicInvoiceNumber = formatInvoiceNumber(inv.invoice_number)
  const templateData = {
    clientName: inv.client_name || clientRow?.name || 'klant',
    clientCompany: clientRow?.name || inv.client_name || '',
    clientAddress: inv.client_address || clientRow?.billing_address || '',
    invoiceNumber: publicInvoiceNumber,
    date: fmtDate(inv.date),
    vatNumber: inv.client_vat_number || clientRow?.vat_number || '',
    items,
    total: fmtEUR(Number(inv.total || 0)),
    isReminder,
    reminderCount,
  }

  const element = React.createElement(invoiceTemplate.component, templateData)
  const html = await render(element)
  const text = await render(element, { plainText: true })
  const subject =
    typeof invoiceTemplate.subject === 'function' ? invoiceTemplate.subject(templateData) : invoiceTemplate.subject

  const { buildInvoicePdfBase64, invoicePdfInputFromRow } = await import('@/lib/invoice-pdf.server')
  const pdfBase64 = await buildInvoicePdfBase64(
    invoicePdfInputFromRow(inv as never, {
      name: clientRow?.name,
      billing_address: clientRow?.billing_address,
      vat_number: clientRow?.vat_number,
    }),
  )

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      from: 'Solyn Global <Factuur@solynglobal.be>',
      to: [toEmail],
      reply_to: 'jason@solynglobal.be',
      subject,
      html,
      text,
      attachments: [{ filename: `Factuur-${publicInvoiceNumber}.pdf`, content: pdfBase64 }],
      tags: [
        { name: 'invoice_id', value: String(inv.id) },
        { name: 'kind', value: isReminder ? 'reminder' : 'initial' },
      ],
    }),
  })

  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Resend error [${res.status}]: ${JSON.stringify(body)}`)

  const messageId = (body as { id?: string })?.id ?? null
  const now = new Date().toISOString()
  const patch: Record<string, unknown> = { resend_message_id: messageId, email_status: 'sent' }
  if (isReminder) {
    patch.last_reminder_at = now
    patch.reminder_count = reminderCount
  } else {
    patch.sent_at = now
    patch.status = 'Sent'
    // clear delivery events from any previous send
    patch.delivered_at = null
    patch.opened_at = null
    patch.bounced_at = null
    patch.complained_at = null
    // scheduling: a sent invoice is no longer pending, and a repeating one gets its next date
    patch.scheduled_send_at = null
    patch.schedule_error = null
    patch.schedule_locked_at = null
    const row = inv as typeof inv & { repeat_monthly?: boolean; repeat_day?: number | null; next_repeat_on?: string | null }
    if (row.repeat_monthly && !row.next_repeat_on) {
      const today = brusselsToday()
      const day = row.repeat_day ?? dayOf(today)
      patch.repeat_day = day
      patch.next_repeat_on = nextMonthlyDate(today, day)
    }
  }

  const { error: upErr } = await supabase.from('invoices').update(patch as never).eq('id', inv.id)
  if (upErr) throw new Error(upErr.message)

  return { ok: true, messageId, to: toEmail, isReminder }
}
