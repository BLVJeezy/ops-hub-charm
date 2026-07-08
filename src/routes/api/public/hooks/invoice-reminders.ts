import { createFileRoute } from '@tanstack/react-router'
import * as React from 'react'
import { render } from '@react-email/render'
import { createClient } from '@supabase/supabase-js'
import { TEMPLATES } from '@/lib/email-templates/registry'

const SENDER_DOMAIN = 'notify.solynglobal.be'
const FROM_DOMAIN = 'solynglobal.be'

// Reminder cadence in days after sent_at / last_reminder_at
const REMINDER_INTERVALS = [7, 14, 30]

function daysAgo(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24)
}

function fmtEUR(n: number) {
  return new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' }).format(n || 0)
}

export const Route = createFileRoute('/api/public/hooks/invoice-reminders')({
  server: {
    handlers: {
      POST: async () => {
        const supabaseUrl = process.env.SUPABASE_URL
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!supabaseUrl || !serviceKey) {
          return Response.json({ error: 'server misconfigured' }, { status: 500 })
        }
        const supabase = createClient(supabaseUrl, serviceKey)

        // Find unpaid invoices already sent
        const { data: invoices, error } = await supabase
          .from('invoices')
          .select('id, invoice_number, client, client_name, total, date, sent_at, last_reminder_at, reminder_count, status')
          .eq('status', 'Sent')
          .not('sent_at', 'is', null)
          .lt('reminder_count', REMINDER_INTERVALS.length)

        if (error) return Response.json({ error: error.message }, { status: 500 })

        const template = TEMPLATES['invoice-email']
        if (!template) return Response.json({ error: 'template missing' }, { status: 500 })

        let sent = 0
        for (const inv of invoices ?? []) {
          const anchor = inv.last_reminder_at ?? inv.sent_at
          if (!anchor) continue
          const needed = REMINDER_INTERVALS[inv.reminder_count] ?? null
          if (needed == null) continue
          // Trigger when enough days elapsed since the anchor
          if (daysAgo(anchor) < needed) continue

          // Fetch client email
          if (!inv.client) continue
          const { data: client } = await supabase
            .from('clients').select('contact_email, name').eq('id', inv.client).maybeSingle()
          const to = client?.contact_email
          if (!to) continue

          const templateData = {
            clientName: inv.client_name || client?.name || 'klant',
            invoiceNumber: inv.invoice_number,
            total: fmtEUR(Number(inv.total || 0)),
            date: inv.date,
            isReminder: true,
            reminderCount: (inv.reminder_count || 0) + 1,
          }

          const messageId = crypto.randomUUID()
          const element = React.createElement(template.component, templateData)
          const html = await render(element)
          const text = await render(element, { plainText: true })
          const subject = typeof template.subject === 'function' ? template.subject(templateData) : template.subject

          await supabase.from('email_send_log').insert({
            message_id: messageId,
            template_name: 'invoice-email',
            recipient_email: to,
            status: 'pending',
          })

          const { error: enqErr } = await supabase.rpc('enqueue_email', {
            queue_name: 'transactional_emails',
            payload: {
              message_id: messageId,
              to,
              from: `Solyn Global <jason@${FROM_DOMAIN}>`,
              reply_to: `jason@${FROM_DOMAIN}`,
              sender_domain: SENDER_DOMAIN,
              subject,
              html,
              text,
              purpose: 'transactional',
              label: 'invoice-reminder',
              idempotency_key: `invoice-reminder-${inv.id}-${(inv.reminder_count || 0) + 1}`,
              queued_at: new Date().toISOString(),
            },
          })

          if (enqErr) {
            await supabase.from('email_send_log').insert({
              message_id: messageId,
              template_name: 'invoice-email',
              recipient_email: to,
              status: 'failed',
              error_message: enqErr.message,
            })
            continue
          }

          await supabase.from('invoices').update({
            last_reminder_at: new Date().toISOString(),
            reminder_count: (inv.reminder_count || 0) + 1,
          }).eq('id', inv.id)
          sent++
        }

        return Response.json({ ok: true, sent, checked: invoices?.length ?? 0 })
      },
    },
  },
})
