import React from 'react'
import { Body, Container, Head, Heading, Html, Preview, Text, Section, Row, Column, Hr, Link } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  clientName?: string
  invoiceNumber?: number | string
  total?: string
  date?: string
  isReminder?: boolean
  reminderCount?: number
}

const InvoiceEmail = ({
  clientName = 'klant',
  invoiceNumber = '0',
  total = '€0',
  date = '',
  isReminder = false,
  reminderCount = 0,
}: Props) => {
  const heading = isReminder
    ? `Herinnering: factuur #${invoiceNumber}`
    : `Uw factuur #${invoiceNumber}`
  const intro = isReminder
    ? `Dit is een vriendelijke herinnering${reminderCount > 1 ? ` (${reminderCount})` : ''} voor de openstaande factuur hieronder.`
    : `Bedankt voor de samenwerking. Hieronder vindt u de details van uw factuur.`
  return (
    <Html lang="nl" dir="ltr">
      <Head />
      <Preview>{heading} — {total}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Solyn Global</Heading>
          <Text style={paragraph}>Beste {clientName},</Text>
          <Text style={paragraph}>{intro}</Text>

          <Section style={box}>
            <Row><Column style={label}>Factuur</Column><Column style={value}>#{invoiceNumber}</Column></Row>
            <Row><Column style={label}>Datum</Column><Column style={value}>{date}</Column></Row>
            <Row><Column style={label}>Totaal</Column><Column style={valueBold}>{total}</Column></Row>
          </Section>

          <Text style={paragraph}>
            Heeft u vragen of wilt u antwoorden? Mail rechtstreeks naar{' '}
            <Link href="mailto:jason@solynglobal.be" style={link}>jason@solynglobal.be</Link>.
          </Text>
          <Hr style={hr} />
          <Text style={footer}>Solyn Global — jason@solynglobal.be</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: InvoiceEmail,
  subject: (d: Record<string, any>) =>
    d?.isReminder
      ? `Herinnering: factuur #${d?.invoiceNumber ?? ''} — Solyn Global`
      : `Uw factuur #${d?.invoiceNumber ?? ''} — Solyn Global`,
  displayName: 'Invoice email',
  previewData: {
    clientName: 'Riory',
    invoiceNumber: 42,
    total: '€500,00',
    date: '2026-07-08',
    isReminder: false,
    reminderCount: 0,
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '560px', margin: '0 auto' }
const h1 = { color: '#0b0b0b', fontSize: '22px', fontWeight: 700, margin: '0 0 16px' }
const paragraph = { color: '#111', fontSize: '14px', lineHeight: '22px', margin: '8px 0' }
const box = { backgroundColor: '#f6f6f6', borderRadius: '10px', padding: '16px', margin: '16px 0' }
const label = { color: '#666', fontSize: '13px', padding: '6px 0', width: '40%' }
const value = { color: '#111', fontSize: '13px', padding: '6px 0' }
const valueBold = { color: '#111', fontSize: '15px', fontWeight: 700, padding: '6px 0' }
const link = { color: '#0b5bd3' }
const hr = { borderColor: '#eee', margin: '24px 0' }
const footer = { color: '#888', fontSize: '12px' }
