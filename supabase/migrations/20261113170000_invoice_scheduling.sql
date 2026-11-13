-- Scheduled and monthly-repeating invoices.
-- - scheduled_send_at: a Draft is emailed automatically on this date (Europe/Brussels), by the daily invoice job.
-- - repeat_monthly: after this invoice is sent, a copy is created AND sent every month on repeat_day.
--   The copy gets its invoice number on the day it is created, so numbering stays chronological.
-- Re-runnable.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS scheduled_send_at date,
  ADD COLUMN IF NOT EXISTS repeat_monthly boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS repeat_day smallint,
  ADD COLUMN IF NOT EXISTS next_repeat_on date,
  ADD COLUMN IF NOT EXISTS repeat_parent uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS schedule_error text,
  ADD COLUMN IF NOT EXISTS schedule_locked_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_repeat_day_range') THEN
    ALTER TABLE public.invoices ADD CONSTRAINT invoices_repeat_day_range CHECK (repeat_day IS NULL OR repeat_day BETWEEN 1 AND 31);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS invoices_scheduled_idx ON public.invoices(scheduled_send_at)
  WHERE status = 'Draft' AND scheduled_send_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS invoices_repeat_idx ON public.invoices(next_repeat_on)
  WHERE repeat_monthly;

NOTIFY pgrst, 'reload schema';
