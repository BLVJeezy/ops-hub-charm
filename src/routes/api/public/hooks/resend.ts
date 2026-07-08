import { createFileRoute } from '@tanstack/react-router'
import { createHmac, timingSafeEqual } from 'crypto'

/**
 * Resend webhook — receives delivery events and writes them onto the matching
 * invoice row (matched by resend_message_id). Uses the Svix "Standard Webhooks"
 * signature scheme with the RESEND_WEBHOOK_SECRET (whsec_...).
 */
export const Route = createFileRoute('/api/public/hooks/resend')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.RESEND_WEBHOOK_SECRET
        if (!secret) return new Response('missing secret', { status: 500 })

        const svixId = request.headers.get('svix-id') || request.headers.get('webhook-id')
        const svixTs = request.headers.get('svix-timestamp') || request.headers.get('webhook-timestamp')
        const svixSig = request.headers.get('svix-signature') || request.headers.get('webhook-signature')
        if (!svixId || !svixTs || !svixSig) {
          return new Response('missing signature headers', { status: 401 })
        }

        const raw = await request.text()

        // whsec_XXXX → base64 decode after prefix
        const secretKey = secret.startsWith('whsec_')
          ? Buffer.from(secret.slice(6), 'base64')
          : Buffer.from(secret, 'utf8')

        const signedPayload = `${svixId}.${svixTs}.${raw}`
        const expected = createHmac('sha256', secretKey).update(signedPayload).digest('base64')

        // svix-signature = "v1,<sig> v1,<sig2> ..."
        const sigs = svixSig
          .split(' ')
          .map((s) => s.split(',')[1])
          .filter(Boolean)
        const expBuf = Buffer.from(expected)
        const match = sigs.some((s) => {
          const b = Buffer.from(s)
          return b.length === expBuf.length && timingSafeEqual(b, expBuf)
        })
        if (!match) return new Response('invalid signature', { status: 401 })

        let evt: any
        try {
          evt = JSON.parse(raw)
        } catch {
          return new Response('bad json', { status: 400 })
        }

        const type: string = evt?.type || ''
        const emailId: string | undefined = evt?.data?.email_id || evt?.data?.id
        if (!emailId) return Response.json({ ok: true, ignored: 'no email id' })

        const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

        const patch: Record<string, unknown> = {}
        const now = new Date().toISOString()

        switch (type) {
          case 'email.sent':
            patch.email_status = 'sent'
            break
          case 'email.delivered':
            patch.email_status = 'delivered'
            patch.delivered_at = now
            break
          case 'email.opened':
            patch.email_status = 'opened'
            patch.opened_at = now
            break
          case 'email.bounced':
          case 'email.delivery_delayed':
            patch.email_status = 'bounced'
            patch.bounced_at = now
            break
          case 'email.complained':
            patch.email_status = 'complained'
            patch.complained_at = now
            break
          case 'email.failed':
            patch.email_status = 'failed'
            break
          default:
            return Response.json({ ok: true, ignored: type })
        }

        const { error } = await supabaseAdmin
          .from('invoices')
          .update(patch as never)
          .eq('resend_message_id', emailId)

        if (error) {
          console.error('resend webhook update failed', error)
          return Response.json({ ok: false, error: error.message }, { status: 500 })
        }
        return Response.json({ ok: true, type, emailId })
      },
    },
  },
})
