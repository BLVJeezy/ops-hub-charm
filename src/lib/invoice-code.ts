const FIRST_CODED_INVOICE = 38
const CODE_SPACE = 456_976_000
const MULTIPLIER = 1_000_003
const OFFSET = 372_315_634
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** Keep the sequential database number internal and expose a stable public code. */
export function formatInvoiceNumber(value: string | number | null | undefined): string {
  if (value == null) return '—'

  const raw = String(value).trim()
  if (!/^\d+$/.test(raw)) return raw

  const invoiceNumber = Number(raw)
  if (!Number.isSafeInteger(invoiceNumber) || invoiceNumber < FIRST_CODED_INVOICE) return raw

  let mixed = (invoiceNumber * MULTIPLIER + OFFSET) % CODE_SPACE
  const lastDigit = mixed % 10
  mixed = Math.floor(mixed / 10)
  const fourthLetter = mixed % 26
  mixed = Math.floor(mixed / 26)
  const twoDigits = mixed % 100
  mixed = Math.floor(mixed / 100)
  const thirdLetter = mixed % 26
  mixed = Math.floor(mixed / 26)
  const secondLetter = mixed % 26
  mixed = Math.floor(mixed / 26)
  const firstLetter = mixed % 26

  return `${LETTERS[firstLetter]}${LETTERS[secondLetter]}${LETTERS[thirdLetter]}${String(twoDigits).padStart(2, '0')}${LETTERS[fourthLetter]}${lastDigit}`
}
