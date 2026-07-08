import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/unsubscribe')({
  ssr: false,
  component: UnsubscribePage,
})

function UnsubscribePage() {
  const [state, setState] = useState<'loading' | 'valid' | 'invalid' | 'already' | 'success' | 'error'>('loading')
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('token')
    setToken(t)
    if (!t) { setState('invalid'); return }
    fetch(`/email/unsubscribe?token=${encodeURIComponent(t)}`)
      .then(async r => {
        const j = await r.json().catch(() => ({}))
        if (!r.ok) setState('invalid')
        else if (j.valid) setState('valid')
        else if (j.reason === 'already_unsubscribed') setState('already')
        else setState('invalid')
      })
      .catch(() => setState('error'))
  }, [])

  async function confirm() {
    if (!token) return
    setState('loading')
    try {
      const r = await fetch('/email/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const j = await r.json().catch(() => ({}))
      if (j.success) setState('success')
      else if (j.reason === 'already_unsubscribed') setState('already')
      else setState('error')
    } catch { setState('error') }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full rounded-2xl border border-border bg-card p-6 text-center space-y-4">
        <h1 className="text-xl font-semibold">Uitschrijven</h1>
        {state === 'loading' && <p className="text-sm text-muted-foreground">Bezig…</p>}
        {state === 'valid' && (
          <>
            <p className="text-sm text-muted-foreground">Weet u zeker dat u zich wilt uitschrijven van e-mails van Solyn Global?</p>
            <Button onClick={confirm} className="w-full">Bevestig uitschrijving</Button>
          </>
        )}
        {state === 'success' && <p className="text-sm">U bent uitgeschreven. U ontvangt geen e-mails meer.</p>}
        {state === 'already' && <p className="text-sm">Dit adres is al uitgeschreven.</p>}
        {state === 'invalid' && <p className="text-sm text-destructive">Ongeldige of verlopen link.</p>}
        {state === 'error' && <p className="text-sm text-destructive">Er ging iets mis. Probeer het later opnieuw.</p>}
      </div>
    </div>
  )
}
