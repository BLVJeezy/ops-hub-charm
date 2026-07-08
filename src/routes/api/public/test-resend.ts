import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/public/test-resend')({
  server: {
    handlers: {
      GET: async () => {
        const key = process.env.RESEND_API_KEY
        if (!key) return Response.json({ error: 'RESEND_API_KEY missing' }, { status: 500 })

        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            from: 'Solyn Global <onboarding@resend.dev>',
            to: ['jasonbalongo@gmail.com'],
            reply_to: 'jason@solynglobal.be',
            subject: 'Testmail van Solyn Global',
            html: `
              <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#111">
                <h2 style="margin:0 0 12px">Hallo Jason 👋</h2>
                <p>Dit is een testmail verstuurd via <strong>Resend</strong> vanuit je Solyn Global app.</p>
                <p>Als je dit ziet, werkt de integratie correct.</p>
                <p style="margin-top:24px;color:#555;font-size:13px">— Solyn Global</p>
              </div>
            `,
          }),
        })

        const body = await res.text()
        return new Response(body, { status: res.status, headers: { 'Content-Type': 'application/json' } })
      },
    },
  },
})
