-- Supportchat tussen de beheerpagina van klantwebsites en de Hub (/support).
-- De klant schrijft via /api/public/support (service role); het team leest mee en antwoordt via een server function.
create table if not exists public.support_threads (
  id uuid primary key default gen_random_uuid(),
  site text not null,
  client_id uuid references public.clients(id) on delete set null,
  request_id uuid references public.client_requests(id) on delete set null,
  title text not null,
  status text not null default 'open' check (status in ('open', 'opgelost')),
  last_author text not null default 'client' check (last_author in ('client', 'solyn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_seen_at timestamptz,
  solyn_seen_at timestamptz
);
create index if not exists support_threads_site on public.support_threads (site, updated_at desc);
create index if not exists support_threads_updated on public.support_threads (updated_at desc);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.support_threads(id) on delete cascade,
  author text not null check (author in ('client', 'solyn')),
  body text not null default '',
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists support_messages_thread on public.support_messages (thread_id, created_at);

alter table public.support_threads enable row level security;
alter table public.support_messages enable row level security;
drop policy if exists "Support threads staff read" on public.support_threads;
create policy "Support threads staff read" on public.support_threads for select to authenticated using (public.is_staff(auth.uid()));
drop policy if exists "Support messages staff read" on public.support_messages;
create policy "Support messages staff read" on public.support_messages for select to authenticated using (public.is_staff(auth.uid()));
