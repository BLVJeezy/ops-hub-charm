import { createServerFn } from '@tanstack/react-start'

export const verifyPin = createServerFn({ method: 'POST' })
  .inputValidator((input: { pin: string }) => {
    if (typeof input?.pin !== 'string' || !/^[0-9]{6}$/.test(input.pin)) throw new Error('Invalid code')
    return input
  })
  .handler(async ({ data }) => {
    const expected = process.env.APP_PIN_CODE
    if (!expected) return { ok: false }
    return { ok: data.pin === expected }
  })
