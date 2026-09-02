import { generateInvoicePDF, type InvoicePDFInput } from './invoice-pdf'

const LOGO_URL =
  'https://solyn22.lovable.app/__l5e/assets-v1/092540db-660e-4b68-a74f-63b871c46f1d/solyn-logo.png'

async function fetchLogoDataUrl(): Promise<string | null> {
  try {
    const res = await fetch(LOGO_URL)
    if (!res.ok) return null
    const buf = await res.arrayBuffer()
    // base64-encode
    const bytes = new Uint8Array(buf)
    let binary = ''
    const chunk = 0x8000
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
    }
    const b64 = btoa(binary)
    return `data:image/png;base64,${b64}`
  } catch {
    return null
  }
}

export async function buildInvoicePdfBase64(input: InvoicePDFInput): Promise<string> {
  const logo = await fetchLogoDataUrl()
  const doc = generateInvoicePDF(input, logo)
  const ab = doc.output('arraybuffer') as ArrayBuffer
  const bytes = new Uint8Array(ab)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export function invoicePdfInputFromRow(inv: {
  invoice_number: number
  date: string
  client_name?: string | null
  client_address?: string | null
  client_vat_number?: string | null
  line_items: unknown
  vat_note?: string | null
  total: number | string
}, fallback: { name?: string; billing_address?: string | null; vat_number?: string | null }): InvoicePDFInput {
  const items = Array.isArray(inv.line_items)
    ? (inv.line_items as Array<{ description: string; amount?: number; qty?: number; unit_price?: number; price?: number }>).map((i) => ({
        description: i.description,
        qty: i.qty ?? 1,
        unit_price: Number(i.unit_price ?? i.price ?? i.amount ?? 0),
      }))
    : []
  return {
    invoice_number: inv.invoice_number,
    date: inv.date,
    client_name: inv.client_name || fallback.name || '',
    client_address: inv.client_address || fallback.billing_address || null,
    client_vat_number: inv.client_vat_number || fallback.vat_number || null,
    line_items: items,
    vat_note: inv.vat_note ?? null,
    total: Number(inv.total || 0),
  }
}
