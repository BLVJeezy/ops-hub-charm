import React from 'react'
import {
  Body,
  Container,
  Head,
  Html,
  Preview,
  Text,
  Section,
  Row,
  Column,
  Img,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface LineItem {
  description: string
  price: string
  note?: string
}

interface Props {
  clientName?: string
  clientCompany?: string
  clientAddress?: string
  invoiceNumber?: number | string
  date?: string
  vatNumber?: string
  items?: LineItem[]
  total?: string
  isReminder?: boolean
  reminderCount?: number
  logoUrl?: string
}

const DEFAULT_LOGO =
  'https://solyn22.lovable.app/__l5e/assets-v1/092540db-660e-4b68-a74f-63b871c46f1d/solyn-logo.png'

function summarizeItems(items?: LineItem[] | Array<{ description?: string }>): string {
  if (!Array.isArray(items) || items.length === 0) return ''
  const parts = Array.from(
    new Set(
      items
        .map((i) => (i?.description || '').trim())
        .filter(Boolean)
    )
  )
  if (parts.length === 0) return ''
  let summary = parts.join(', ')
  if (summary.length > 45) summary = summary.slice(0, 42).trimEnd() + '…'
  return summary
}

const InvoiceEmail = ({
  clientName = 'klant',
  clientCompany = '',
  clientAddress = '',
  invoiceNumber = '0',
  date = '',
  vatNumber = 'BE 0840.931.404',
  items = [{ description: 'Dienst', price: '€0', note: 'BTW (0% - Reverse Charge)' }],
  total = '€0',
  isReminder = false,
  reminderCount = 0,
  logoUrl = DEFAULT_LOGO,
}: Props) => {
  const preview = isReminder
    ? `Herinnering factuur #${invoiceNumber} — ${total}`
    : `Factuur #${invoiceNumber} — ${total}`

  return (
    <Html lang="nl" dir="ltr">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          {isReminder && (
            <Section style={reminderBanner}>
              <Text style={reminderText}>
                Vriendelijke herinnering{reminderCount > 1 ? ` (${reminderCount})` : ''} — deze factuur staat nog open.
              </Text>
            </Section>
          )}

          {/* Header: logo + title */}
          <Section>
            <Row>
              <Column style={{ width: '60%', verticalAlign: 'middle' }}>
                <table cellPadding={0} cellSpacing={0} border={0}>
                  <tbody>
                    <tr>
                      <td style={{ verticalAlign: 'middle', paddingRight: '12px' }}>
                        <Img src={logoUrl} width="56" height="56" alt="Solyn Global" style={logo} />
                      </td>
                      <td style={{ verticalAlign: 'middle' }}>
                        <Text style={brandName}>Solyn Global</Text>
                        <Text style={brandSub}>Ops &amp; Invoicing</Text>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </Column>
              <Column style={{ width: '40%', textAlign: 'right', verticalAlign: 'top' }}>
                <Text style={factuurTitle}>FACTUUR</Text>
                <Text style={factuurNumber}>#{invoiceNumber}</Text>
              </Column>
            </Row>
          </Section>

          <Section style={{ marginTop: '32px' }}>
            <Row>
              <Column style={{ width: '60%', verticalAlign: 'top' }}>
                <Text style={metaLabel}>GEFACTUREERD AAN:</Text>
                <Text style={metaValue}>{clientCompany || clientName}</Text>
                {clientAddress ? <Text style={metaValue}>{clientAddress}</Text> : null}
              </Column>
              <Column style={{ width: '40%', textAlign: 'right', verticalAlign: 'top' }}>
                <Text style={metaLabel}>DATUM:</Text>
                <Text style={metaValue}>{date}</Text>
                <Text style={{ ...metaLabel, marginTop: '12px' }}>BEDRIJFSNUMMER:</Text>
                <Text style={metaValue}>{vatNumber}</Text>
              </Column>
            </Row>
          </Section>

          {/* Items table */}
          <Section style={{ marginTop: '32px' }}>
            <Row style={itemsHeader}>
              <Column style={{ ...itemsHeaderCell, textAlign: 'left' }}>BESCHRIJVING</Column>
              <Column style={{ ...itemsHeaderCell, textAlign: 'right' }}>PRIJS</Column>
            </Row>
            {items.map((item, i) => (
              <Row key={i} style={itemRow}>
                <Column style={{ ...itemCell, textAlign: 'left' }}>
                  <Text style={itemDesc}>{item.description}</Text>
                  {item.note ? <Text style={itemNote}>{item.note}</Text> : null}
                </Column>
                <Column style={{ ...itemCell, textAlign: 'right', verticalAlign: 'top' }}>
                  <Text style={itemPrice}>{item.price}</Text>
                </Column>
              </Row>
            ))}
            <Row>
              <Column colSpan={2}>
                <div style={divider} />
              </Column>
            </Row>
            <Row style={totalRow}>
              <Column style={{ ...totalCell, textAlign: 'left' }}>TOTAAL:</Column>
              <Column style={{ ...totalCell, textAlign: 'right' }}>{total}</Column>
            </Row>
          </Section>

          {/* Payment info */}
          <Section style={{ marginTop: '56px' }}>
            <Text style={metaLabel}>BETAAL AAN:</Text>
            <Text style={payLine}>Bedrijfsnaam: Solyn Global LTD</Text>
            <Text style={payLine}>
              71-75 Shelton Street, Covent Garden, London, WC2H 9JQ, United Kingdom
            </Text>
            <Text style={payLine}>Bedrijfsnummer: 16876148</Text>
            <Text style={payLine}>Rekeningnummer: GB50REVO23012053167437</Text>
            <Text style={payLine}>BIC: REVOGB21</Text>
            <Text style={btwNote}>
              <em>
                Btw verlegd: De medecontractant is gehouden tot voldoening van de belasting
                overeenkomstig artikel 196 van Richtlijn 2006/112/EG.
              </em>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: InvoiceEmail,
  subject: (d: Record<string, any>) => {
    const summary = summarizeItems(d?.items)
    const suffix = summary ? ` — ${summary}` : ''
    return d?.isReminder
      ? `Herinnering: factuur #${d?.invoiceNumber ?? ''}${suffix} — Solyn Global`
      : `Factuur #${d?.invoiceNumber ?? ''}${suffix} — Solyn Global`
  },
  displayName: 'Invoice email',
  previewData: {
    clientName: 'Riory',
    clientCompany: 'Riory BV',
    clientAddress: 'Natveld 47, 3740 Bilzen',
    invoiceNumber: 26,
    date: '05-07-2026',
    vatNumber: 'BE 0840.931.404',
    items: [{ description: 'SEO July 2026', price: '€500', note: 'BTW (0% - Reverse Charge)' }],
    total: '€500',
    isReminder: false,
    reminderCount: 0,
  },
} satisfies TemplateEntry

// ============ styles ============
const main = { backgroundColor: '#ffffff', fontFamily: 'Helvetica, Arial, sans-serif', color: '#111' }
const container = { padding: '40px 32px', maxWidth: '640px', margin: '0 auto' }

const logo = { borderRadius: '50%', display: 'block' }
const brandName = { margin: 0, fontSize: '18px', fontWeight: 700, color: '#111' }
const brandSub = { margin: 0, fontSize: '13px', color: '#8a8a8a' }

const factuurTitle = { margin: 0, fontSize: '34px', fontWeight: 800, letterSpacing: '-0.5px', color: '#111' }
const factuurNumber = { margin: '2px 0 0', fontSize: '12px', color: '#8a8a8a' }

const metaLabel = { margin: 0, fontSize: '11px', fontWeight: 700, color: '#8a8a8a', letterSpacing: '0.5px' }
const metaValue = { margin: '4px 0 0', fontSize: '14px', color: '#111' }

const itemsHeader = { backgroundColor: '#f3f3f3' }
const itemsHeaderCell = {
  padding: '12px 16px',
  fontSize: '11px',
  fontWeight: 700,
  color: '#8a8a8a',
  letterSpacing: '0.5px',
}
const itemRow = {}
const itemCell = { padding: '14px 16px', verticalAlign: 'top' as const }
const itemDesc = { margin: 0, fontSize: '14px', color: '#111' }
const itemNote = { margin: '6px 0 0', fontSize: '12px', color: '#8a8a8a' }
const itemPrice = { margin: 0, fontSize: '14px', color: '#111' }
const divider = { borderTop: '1px solid #e5e5e5', margin: '0 16px' }

const totalRow = { backgroundColor: '#f3f3f3' }
const totalCell = { padding: '14px 16px', fontSize: '15px', fontWeight: 700, color: '#111' }

const payLine = { margin: '4px 0 0', fontSize: '13px', color: '#111' }
const btwNote = { marginTop: '16px', fontSize: '11px', color: '#8a8a8a', lineHeight: '16px' }

const reminderBanner = {
  backgroundColor: '#fff7ed',
  border: '1px solid #fed7aa',
  borderRadius: '8px',
  padding: '10px 14px',
  marginBottom: '20px',
}
const reminderText = { margin: 0, color: '#9a3412', fontSize: '13px', fontWeight: 600 }
