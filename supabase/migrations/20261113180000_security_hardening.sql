-- Security hardening for findings from Lovable's security scan. Re-runnable.

-- 1. Email queue functions: server (service role) only.
REVOKE EXECUTE ON FUNCTION public.enqueue_email, public.read_email_batch, public.delete_email, public.move_to_dlq FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_email, public.read_email_batch, public.delete_email, public.move_to_dlq TO service_role;

-- 2. Role helpers: not callable by logged-out visitors (RLS still uses them for signed-in users).
REVOKE EXECUTE ON FUNCTION public.has_role, public.is_staff, public.current_user_role FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role, public.is_staff, public.current_user_role TO authenticated, service_role;

-- 3. Trigger functions never need to be called directly.
REVOKE EXECUTE ON FUNCTION public.handle_new_user, public.assign_invoice_number, public.update_updated_at_column FROM PUBLIC, anon, authenticated;

-- 4. Secret for the daily invoice job, kept in Vault, checked by a server-only function.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'invoice_cron_secret') THEN
    PERFORM vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'invoice_cron_secret');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.verify_cron_secret(_name text, _token text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, vault AS $$
  SELECT coalesce(length(_token) >= 32 AND _token = (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = _name), false)
$$;
REVOKE EXECUTE ON FUNCTION public.verify_cron_secret FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_cron_secret TO service_role;

-- 5. Daily invoice job sends the secret. Harmless for the old app version (extra header is ignored).
DO $$
DECLARE jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'invoice-reminders-daily';
  IF jid IS NOT NULL THEN
    PERFORM cron.alter_job(jid, command := $cmd$
      SELECT net.http_post(
        url := 'https://project--82da2251-738e-4633-9ced-6f4036c59715.lovable.app/api/public/hooks/invoice-reminders',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'invoice_cron_secret')
        ),
        body := '{}'::jsonb
      );
    $cmd$);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
