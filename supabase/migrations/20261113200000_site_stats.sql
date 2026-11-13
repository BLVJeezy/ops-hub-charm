-- Daily statistics per monitored site, computed in the database (health_checks can
-- hold tens of thousands of rows; the API returns at most 1000).
-- SECURITY INVOKER: the caller's RLS applies (team members only). Re-runnable.

CREATE OR REPLACE FUNCTION public.site_daily_stats(_site uuid, _days integer DEFAULT 30)
RETURNS TABLE (day date, kind text, checks integer, ok integer, avg_ms integer, p95_ms integer)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT (checked_at AT TIME ZONE 'Europe/Brussels')::date AS day,
         kind,
         count(*)::int AS checks,
         count(*) FILTER (WHERE ok)::int AS ok,
         round(avg(response_ms) FILTER (WHERE ok))::int AS avg_ms,
         round(percentile_cont(0.95) WITHIN GROUP (ORDER BY response_ms) FILTER (WHERE ok))::int AS p95_ms
  FROM public.health_checks
  WHERE site_id = _site
    AND checked_at >= now() - make_interval(days => least(greatest(_days, 1), 90))
  GROUP BY 1, 2
  ORDER BY 1, 2
$$;

REVOKE EXECUTE ON FUNCTION public.site_daily_stats(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.site_daily_stats(uuid, integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- Automatic monitoring every 5 minutes (each site is checked when its own interval has passed).
SELECT cron.schedule('status-hub-monitor', '*/5 * * * *', $cmd$
  SELECT net.http_post(
    url := 'https://project--82da2251-738e-4633-9ced-6f4036c59715.lovable.app/api/public/hooks/monitor-run',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key')),
    body := '{}'::jsonb, timeout_milliseconds := 60000);
$cmd$);
