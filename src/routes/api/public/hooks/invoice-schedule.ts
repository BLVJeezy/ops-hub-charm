import { createFileRoute } from '@tanstack/react-router'
import { createClient } from '@supabase/supabase-js'

/**
 * Hourly job (pg_cron "invoice-schedule-hourly"): sends scheduled invoices and
 * monthly repeats whose date + hour (Europe/Brussels) has come.
 * Same protection as the reminders job: Bearer <service role key>.
 */
export const Route = createFileRoute('/api/public/hooks/invoice-schedule')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const supabaseUrl = process.env.SUPABASE_URL
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!supabaseUrl || !serviceKey || !process.env.RESEND_API_KEY) {
          return Response.json({ error: 'server misconfigured' }, { status: 500 })
        }
        const auth = request.headers.get('authorization') ?? ''
        const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : ''
        if (!bearer || bearer !== serviceKey) return new Response('unauthorized', { status: 401 })

        const supabase = createClient(supabaseUrl, serviceKey)
        try {
          const { processScheduledInvoices } = await import('@/lib/invoice-scheduler.server')
          const summary = await processScheduledInvoices(supabase as never)
          return Response.json({ ok: true, ...summary })
        } catch (e) {
          console.error('invoice-schedule failed', e)
          return Response.json({ ok: false, error: 'run failed' }, { status: 500 })
        }
      },
    },
  },
})
