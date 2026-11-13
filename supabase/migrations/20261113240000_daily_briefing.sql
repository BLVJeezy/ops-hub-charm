-- Daily noon briefing: a snapshot of every client site (health, incidents, visitors, new requests)
-- plus invoices, stored once per day. The briefing film is rendered from this snapshot.
CREATE TABLE IF NOT EXISTS public.daily_briefings (
  day date PRIMARY KEY,                 -- Brussels date
  created_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL,                 -- ok | warning | critical
  snapshot jsonb NOT NULL,
  video_path text,                      -- where the rendered film is kept (see docs/daily-briefing.md)
  chapters jsonb,                       -- [{t, label, site_id}] for the Hub player
  rendered_at timestamptz,
  render_error text,
  emailed_at timestamptz
);
ALTER TABLE public.daily_briefings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Briefings read staff" ON public.daily_briefings;
CREATE POLICY "Briefings read staff" ON public.daily_briefings FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.briefing_snapshot()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
WITH d AS (SELECT (now() AT TIME ZONE 'Europe/Brussels')::date AS today),
s AS (
  SELECT ms.id, ms.name, ms.url, ms.is_critical, ms.last_status, ms.last_response_ms, ms.last_error, ms.last_checked_at,
    (SELECT round(100.0 * avg(CASE WHEN h.ok THEN 1 ELSE 0 END), 2) FROM health_checks h
       WHERE h.site_id = ms.id AND h.kind = 'http' AND h.checked_at > now() - interval '24 hours') AS uptime24,
    (SELECT count(*) FROM health_checks h WHERE h.site_id = ms.id AND h.checked_at > now() - interval '24 hours') AS checks24,
    (SELECT coalesce(jsonb_agg(jsonb_build_object('severity', i.severity, 'title', i.title, 'kind', i.kind, 'opened_at', i.opened_at, 'status', i.status) ORDER BY i.opened_at DESC), '[]')
       FROM incidents i WHERE i.site_id = ms.id AND (i.status = 'open' OR i.opened_at > now() - interval '24 hours')) AS incidents,
    (SELECT v.visitors FROM site_visits_daily v, d WHERE v.site_id = ms.id AND v.day = d.today - 1) AS visitors_yesterday,
    (SELECT v.visitors FROM site_visits_daily v, d WHERE v.site_id = ms.id AND v.day = d.today - 2) AS visitors_day_before,
    (SELECT sum(v.visitors) FROM site_visits_daily v, d WHERE v.site_id = ms.id AND v.day > d.today - 8 AND v.day < d.today) AS visitors_7d,
    (SELECT sum(v.pageviews) FROM site_visits_daily v, d WHERE v.site_id = ms.id AND v.day = d.today - 1) AS pageviews_yesterday,
    (SELECT count(*) FROM site_records r WHERE r.site_id = ms.id AND r.kind <> 'blokkade'
       AND coalesce(r.source_created_at, r.starts_at) > now() - interval '24 hours') AS new_24h,
    (SELECT count(*) FROM site_records r WHERE r.site_id = ms.id AND r.kind IN ('afspraak', 'reservatie')
       AND r.starts_at >= now() AND r.starts_at < now() + interval '7 days' AND coalesce(r.status, '') !~* 'cancel|geannuleerd') AS upcoming_7d
  FROM monitored_sites ms WHERE ms.enabled
)
SELECT jsonb_build_object(
  'generated_at', now(),
  'day', (SELECT today FROM d),
  'sites', coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.name) FROM s), '[]'),
  'invoices', jsonb_build_object(
    'open_count', (SELECT count(*) FROM invoices WHERE status = 'Sent'),
    'open_total', (SELECT coalesce(sum(total), 0) FROM invoices WHERE status = 'Sent'),
    'overdue_count', (SELECT count(*) FROM invoices WHERE status = 'Sent' AND date < (SELECT today FROM d) - 30),
    'draft_count', (SELECT count(*) FROM invoices WHERE status = 'Draft'),
    'paid_30d', (SELECT coalesce(sum(total), 0) FROM invoices WHERE status = 'Paid' AND date >= (SELECT today FROM d) - 30),
    'scheduled_today', (SELECT count(*) FROM invoices WHERE scheduled_send_at::date = (SELECT today FROM d))
  )
);
$$;
REVOKE ALL ON FUNCTION public.briefing_snapshot() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- 11:30 Brussels: store today's snapshot (the film is rendered from it); 12:00 Brussels: email the briefing.
-- Each job runs at two UTC times and the hook ignores the one that is not that Brussels hour (DST).
DO $$ BEGIN
  PERFORM cron.unschedule('briefing-snapshot') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'briefing-snapshot');
  PERFORM cron.unschedule('briefing-mail') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'briefing-mail');
END $$;
SELECT cron.schedule('briefing-snapshot', '30 9,10 * * *', $c$
  SELECT net.http_post(url := 'https://project--82da2251-738e-4633-9ced-6f4036c59715.lovable.app/api/public/hooks/daily-briefing',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='email_queue_service_role_key')),
    body := '{"action":"snapshot","hour":11}'::jsonb, timeout_milliseconds := 30000);
$c$);
SELECT cron.schedule('briefing-mail', '0 10,11 * * *', $c$
  SELECT net.http_post(url := 'https://project--82da2251-738e-4633-9ced-6f4036c59715.lovable.app/api/public/hooks/daily-briefing',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='email_queue_service_role_key')),
    body := '{"action":"mail","hour":12}'::jsonb, timeout_milliseconds := 30000);
$c$);
