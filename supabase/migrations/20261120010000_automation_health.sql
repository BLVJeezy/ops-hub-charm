-- Hourly automation check: the latest verdict per automation, and when I was last told about a problem.
create table if not exists public.automation_health (
  automation_id text primary key,
  status text not null check (status in ('ok', 'stale', 'unknown')),
  detail text,
  checked_at timestamptz not null default now(),
  since timestamptz not null default now(),
  alerted_at timestamptz
);
alter table public.automation_health enable row level security;
drop policy if exists "Automation health staff read" on public.automation_health;
create policy "Automation health staff read" on public.automation_health for select to authenticated using (public.is_staff(auth.uid()));

-- Last run and result of each cron job, for the check (the cron schema is not exposed to the API).
create or replace function public.cron_status()
returns table (jobname text, last_run timestamptz, last_status text)
language sql security definer set search_path = public, cron as $$
  select j.jobname::text, d.start_time, d.status::text
  from cron.job j
  left join lateral (select start_time, status from cron.job_run_details r where r.jobid = j.jobid order by start_time desc limit 1) d on true
  where j.active;
$$;
revoke all on function public.cron_status() from public, anon, authenticated;
grant execute on function public.cron_status() to service_role;

select cron.schedule('automation-health-hourly', '17 * * * *', $cmd$
  SELECT net.http_post(
    url := 'https://project--82da2251-738e-4633-9ced-6f4036c59715.lovable.app/api/public/hooks/automation-health',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key')),
    body := '{}'::jsonb, timeout_milliseconds := 60000);
$cmd$);
