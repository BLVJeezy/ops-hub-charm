-- Request timer: an estimate, time worked, and a paused state.
-- worked_seconds holds finished stretches; run_started_at is set while the clock runs.
alter table public.client_requests drop constraint if exists client_requests_status_check;
alter table public.client_requests add constraint client_requests_status_check
  check (status in ('nieuw', 'ingepland', 'bezig', 'gepauzeerd', 'klaar', 'afgewezen'));
alter table public.client_requests
  add column if not exists estimate_minutes int check (estimate_minutes between 5 and 60000),
  add column if not exists run_started_at timestamptz,
  add column if not exists worked_seconds int not null default 0;
