import { createServerFn } from '@tanstack/react-start'
import * as React from 'react'
import { render } from '@react-email/render'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'
import { template as invoiceTemplate } from '@/lib/email-templates/invoice-email'

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

export const sendInvoiceMail = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { invoiceId: string; isReminder?: boolean }) => input)
  .handler(async ({ data, context }) => {
    const key = process.env.RESEND_API_KEY
    if (!key) throw new Error('RESEND_API_KEY not configured')

    const { supabase } = context
    const { data: inv, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', data.invoiceId)
      .maybeSingle()
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

    const reminderCount = (inv.reminder_count || 0) + (data.isReminder ? 1 : 0)
    const templateData = {
      clientName: inv.client_name || clientRow?.name || 'klant',
      clientCompany: clientRow?.name || inv.client_name || '',
      clientAddress: inv.client_address || clientRow?.billing_address || '',
      invoiceNumber: inv.invoice_number ?? undefined,
      date: fmtDate(inv.date),
      vatNumber: inv.client_vat_number || clientRow?.vat_number || '',
      items,
      total: fmtEUR(Number(inv.total || 0)),
      isReminder: !!data.isReminder,
      reminderCount,
    }

    const element = React.createElement(invoiceTemplate.component, templateData)
    const html = await render(element)
    const text = await render(element, { plainText: true })
    const subject =
      typeof invoiceTemplate.subject === 'function'
        ? invoiceTemplate.subject(templateData)
        : invoiceTemplate.subject

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        from: 'Solyn Global <Factuur@solynglobal.be>',
        to: [toEmail],
        reply_to: 'jason@solynglobal.be',
        subject,
        html,
        text,
        tags: [
          { name: 'invoice_id', value: String(inv.id) },
          { name: 'kind', value: data.isReminder ? 'reminder' : 'initial' },
        ],
      }),
    })

    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(`Resend error [${res.status}]: ${JSON.stringify(body)}`)
    }

    const messageId = (body as { id?: string })?.id ?? null
    const now = new Date().toISOString()
    const patch: Record<string, unknown> = {
      resend_message_id: messageId,
      email_status: 'sent',
    }
    if (data.isReminder) {
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
    }

    const { error: upErr } = await supabase.from('invoices').update(patch as never).eq('id', inv.id)
    if (upErr) throw new Error(upErr.message)

    return { ok: true, messageId, to: toEmail, isReminder: !!data.isReminder }
  })
