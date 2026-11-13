-- Audit 2026-11-13: tighten two loose ends.
-- 1. Backup status is for signed-in staff only (was callable without login).
REVOKE EXECUTE ON FUNCTION public.backup_status() FROM anon;
-- 2. Keep the cron run history bounded (the monitor alone adds ~288 rows a day).
SELECT cron.schedule('cron-history-prune', '40 3 * * 0',
  $$DELETE FROM cron.job_run_details WHERE end_time < now() - interval '14 days'$$);
