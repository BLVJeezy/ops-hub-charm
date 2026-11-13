-- Send hour (Europe/Brussels, 0–23) for scheduled and repeating invoices. Re-runnable.
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS scheduled_send_hour smallint,
  ADD COLUMN IF NOT EXISTS repeat_hour smallint;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_send_hour_range') THEN
    ALTER TABLE public.invoices ADD CONSTRAINT invoices_send_hour_range
      CHECK ((scheduled_send_hour IS NULL OR scheduled_send_hour BETWEEN 0 AND 23)
         AND (repeat_hour IS NULL OR repeat_hour BETWEEN 0 AND 23));
  END IF;
END $$;

-- Jobs authenticate with the service role key already stored in Vault.
-- Hourly: scheduled invoices + monthly repeats.
SELECT cron.schedule('invoice-schedule-hourly', '0 * * * *', $cmd$
  SELECT net.http_post(
    url := 'https://project--82da2251-738e-4633-9ced-6f4036c59715.lovable.app/api/public/hooks/invoice-schedule',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key')),
    body := '{}'::jsonb, timeout_milliseconds := 60000);
$cmd$);

-- Daily 10:00: payment reminders (route now requires the key).
SELECT cron.schedule('invoice-reminders-daily', '0 9 * * *', $cmd$
  SELECT net.http_post(
    url := 'https://project--82da2251-738e-4633-9ced-6f4036c59715.lovable.app/api/public/hooks/invoice-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key')),
    body := '{}'::jsonb, timeout_milliseconds := 60000);
$cmd$);

NOTIFY pgrst, 'reload schema';
