-- Request pipeline: when I started and finished a request, and whether the client was mailed about it.
alter table public.client_requests
  add column if not exists started_at timestamptz,
  add column if not exists done_at timestamptz,
  add column if not exists start_mailed_at timestamptz,
  add column if not exists done_mailed_at timestamptz;
