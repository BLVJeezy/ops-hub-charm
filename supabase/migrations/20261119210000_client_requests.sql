-- Client requests: each client gets a private link (/aanvraag/<token>) where they file what they need.
-- BLV sorts them by priority and turns them into tasks. The public page reads and writes only through the server.
create extension if not exists pgcrypto;
alter table public.clients add column if not exists request_token text unique default encode(gen_random_bytes(18), 'hex');
update public.clients set request_token = encode(gen_random_bytes(18), 'hex') where request_token is null;

create table if not exists public.client_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 140),
  details text check (char_length(details) <= 4000),
  kind text not null default 'andere' check (kind in ('wijziging', 'nieuwe-pagina', 'seo', 'social', 'probleem', 'andere')),
  pages int check (pages between 1 and 50),
  urgency text not null default 'normaal' check (urgency in ('laag', 'normaal', 'hoog', 'dringend')),
  priority int check (priority between 1 and 4),
  status text not null default 'nieuw' check (status in ('nieuw', 'ingepland', 'bezig', 'klaar', 'afgewezen')),
  estimate_eur numeric(10, 2),
  wished_date date,
  contact_name text,
  contact_email text,
  attachments jsonb not null default '[]',
  task_id uuid references public.client_tasks(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists client_requests_client on public.client_requests (client_id, created_at desc);
create index if not exists client_requests_open on public.client_requests (status) where status in ('nieuw', 'ingepland', 'bezig');

alter table public.client_requests enable row level security;
drop policy if exists "Client requests staff all" on public.client_requests;
create policy "Client requests staff all" on public.client_requests for all to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
