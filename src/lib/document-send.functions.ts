import { createServerFn } from '@tanstack/react-start'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'

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

export const sendClientDocument = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { documentId: string }) => input)
  .handler(async ({ data, context }) => {
    const key = process.env.RESEND_API_KEY
    if (!key) throw new Error('RESEND_API_KEY not configured')

    const { supabase } = context
    const { data: doc, error: docErr } = await supabase
      .from('client_documents')
      .select('*')
      .eq('id', data.documentId)
      .maybeSingle()
    if (docErr) throw new Error(docErr.message)
    if (!doc) throw new Error('Document not found')

    const { data: clientRow, error: clientErr } = await supabase
      .from('clients')
      .select('name, contact_email')
      .eq('id', doc.client)
      .maybeSingle()
    if (clientErr) throw new Error(clientErr.message)
    const toEmail = clientRow?.contact_email?.trim()
    if (!toEmail) throw new Error('Klant heeft geen e-mailadres')

    const { data: signed, error: signErr } = await supabase.storage
      .from('client-documents')
      .createSignedUrl(doc.storage_path, 60 * 60 * 24 * 365 * 10) // ~10 years — effectively permanent
    if (signErr || !signed) throw new Error(signErr?.message ?? 'Kon downloadlink niet aanmaken')

    const displayTitle = doc.title || doc.file_name
    const displayDate = doc.document_date ? fmtDate(doc.document_date) : fmtDate(doc.created_at)
    const clientName = clientRow?.name || 'klant'

    const html = `
      <div style="font-family:Arial,sans-serif;color:#1B222C;max-width:520px;margin:0 auto;">
        <p>Hoi ${clientName},</p>
        <p>Hierbij het volgende document van Solyn Global:</p>
        <p style="background:#f5f5f3;border-left:4px solid #C9A24B;padding:12px 16px;margin:16px 0;">
          <strong>${displayTitle}</strong><br>
          <span style="color:#6b6b6b;font-size:13px;">${displayDate}</span>
        </p>
        <p><a href="${signed.signedUrl}" style="background:#C9A24B;color:#1B222C;font-weight:bold;padding:12px 22px;border-radius:8px;text-decoration:none;display:inline-block;">Document bekijken</a></p>
        <p>Met vriendelijke groet,<br>Jason — Solyn Global</p>
      </div>
    `

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        from: 'Solyn Global <jason@solynglobal.be>',
        to: [toEmail],
        reply_to: 'jason@solynglobal.be',
        subject: `${displayTitle} — Solyn Global`,
        html,
      }),
    })
    if (!res.ok) {
      const t = await res.text()
      throw new Error(`Resend error: ${t}`)
    }

    await supabase
      .from('client_documents')
      .update({ last_sent_at: new Date().toISOString(), last_sent_to: toEmail })
      .eq('id', doc.id)

    return { ok: true, sentTo: toEmail }
  })
