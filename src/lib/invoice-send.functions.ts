import { createServerFn } from '@tanstack/react-start'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'

export const sendInvoiceMail = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { invoiceId: string; isReminder?: boolean }) => input)
  .handler(async ({ data, context }) => {
    const { deliverInvoice } = await import('@/lib/invoice-mail.server')
    return deliverInvoice(context.supabase, data.invoiceId, { isReminder: data.isReminder })
  })
