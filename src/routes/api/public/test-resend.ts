import { createFileRoute } from '@tanstack/react-router'
import * as React from 'react'
import { render } from '@react-email/render'
import { template as invoiceTemplate } from '@/lib/email-templates/invoice-email'

export const Route = createFileRoute('/api/public/test-resend')({
  server: {
    handlers: {
      GET: async () => {
        const key = process.env.RESEND_API_KEY
        if (!key) return Response.json({ error: 'RESEND_API_KEY missing' }, { status: 500 })

        const data = {
          clientName: 'Riory',
          clientCompany: 'Riory BV',
          clientAddress: 'Natveld 47, 3740 Bilzen',
          invoiceNumber: 26,
          date: '05-07-2026',
          vatNumber: 'BE 0840.931.404',
          items: [
            { description: 'SEO July 2026', price: '€500', note: 'BTW (0% - Reverse Charge)' },
          ],
          total: '€500',
        }

        const element = React.createElement(invoiceTemplate.component, data)
        const html = await render(element)
        const text = await render(element, { plainText: true })

        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            from: 'Solyn Global <Factuur@solynglobal.be>',
            to: ['jasonbalongo@gmail.com'],
            reply_to: 'jason@solynglobal.be',
            subject: 'Factuur #26 — Solyn Global',
            html,
            text,
          }),
        })

        const body = await res.text()
        return new Response(body, {
          status: res.status,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    },
  },
})
