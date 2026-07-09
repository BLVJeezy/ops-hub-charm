import { createFileRoute } from '@tanstack/react-router'
import * as React from 'react'
import { render } from '@react-email/render'
import { createClient } from '@supabase/supabase-js'
import { template as invoiceTemplate } from '@/lib/email-templates/invoice-email'

// Weekly reminders after the initial send, forever, until an admin marks Paid.
const REMINDER_INTERVAL_DAYS = 7

function daysAgo(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24)
}

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

export const Route = createFileRoute('/api/public/hooks/invoice-reminders')({
  server: {
    handlers: {
      POST: async () => {
        const supabaseUrl = process.env.SUPABASE_URL
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        const resendKey = process.env.RESEND_API_KEY
        if (!supabaseUrl || !serviceKey || !resendKey) {
          return Response.json({ error: 'server misconfigured' }, { status: 500 })
        }
        const supabase = createClient(supabaseUrl, serviceKey)

        const { data: invoices, error } = await supabase
          .from('invoices')
          .select('*')
          .eq('status', 'Sent')
          .not('sent_at', 'is', null)

        if (error) return Response.json({ error: error.message }, { status: 500 })

        let sent = 0
        const results: Array<{ id: string; ok: boolean; error?: string }> = []

        for (const inv of invoices ?? []) {
          const anchor: string = inv.last_reminder_at ?? inv.sent_at
          if (!anchor) continue
          if (daysAgo(anchor) < REMINDER_INTERVAL_DAYS) continue
          if (!inv.client) continue

          const { data: client } = await supabase
            .from('clients')
            .select('contact_email, name, billing_address, vat_number')
            .eq('id', inv.client)
            .maybeSingle()
          const to = client?.contact_email?.trim()
          if (!to) continue

          const items = Array.isArray(inv.line_items)
            ? (inv.line_items as Array<{ description: string; amount?: number; note?: string }>).map((i) => ({
                description: i.description,
                price: fmtEUR(Number(i.amount || 0)),
                note: i.note || inv.vat_note || 'BTW (0% - Reverse Charge)',
              }))
            : []

          const reminderCount = (inv.reminder_count || 0) + 1
          const templateData = {
            clientName: inv.client_name || client?.name || 'klant',
            clientCompany: client?.name || inv.client_name || '',
            clientAddress: inv.client_address || client?.billing_address || '',
            invoiceNumber: inv.invoice_number,
            date: fmtDate(inv.date),
            vatNumber: inv.client_vat_number || client?.vat_number || '',
            items,
            total: fmtEUR(Number(inv.total || 0)),
            isReminder: true,
            reminderCount,
          }

          const element = React.createElement(invoiceTemplate.component, templateData)
          const html = await render(element)
          const text = await render(element, { plainText: true })
          const subject =
            typeof invoiceTemplate.subject === 'function'
              ? invoiceTemplate.subject(templateData)
              : invoiceTemplate.subject

          const { buildInvoicePdfBase64, invoicePdfInputFromRow } = await import('@/lib/invoice-pdf.server')
          const pdfBase64 = await buildInvoicePdfBase64(
            invoicePdfInputFromRow(inv as never, {
              name: client?.name,
              billing_address: client?.billing_address,
              vat_number: client?.vat_number,
            }),
          )

          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${resendKey}`,
            },
            body: JSON.stringify({
              from: 'Solyn Global <Factuur@solynglobal.be>',
              to: [to],
              reply_to: 'jason@solynglobal.be',
              subject,
              html,
              text,
              attachments: [
                {
                  filename: `Factuur-${inv.invoice_number}.pdf`,
                  content: pdfBase64,
                },
              ],
              tags: [
                { name: 'invoice_id', value: String(inv.id) },
                { name: 'kind', value: 'reminder' },
              ],
            }),
          })

          const body = await res.json().catch(() => ({}))
          if (!res.ok) {
            results.push({ id: inv.id, ok: false, error: JSON.stringify(body) })
            continue
          }

          const messageId = (body as { id?: string })?.id ?? null
          await supabase
            .from('invoices')
            .update({
              resend_message_id: messageId,
              email_status: 'sent',
              last_reminder_at: new Date().toISOString(),
              reminder_count: reminderCount,
            } as never)
            .eq('id', inv.id)

          sent++
          results.push({ id: inv.id, ok: true })
        }

        return Response.json({ ok: true, checked: invoices?.length ?? 0, sent, results })
      },
    },
  },
})
