-- Brain overview: tasks (mine or the client's) and a per-month video tracker for social media clients.
alter table public.clients add column if not exists social_videos_per_month integer;

create table if not exists public.client_tasks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade,
  title text not null,
  assignee text not null default 'me' check (assignee in ('me','client')),
  due_date date,
  done_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists client_tasks_client_idx on public.client_tasks (client_id);
alter table public.client_tasks enable row level security;
create policy "Tasks staff all" on public.client_tasks for all to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

-- one row per delivered video; no row = still to make
create table if not exists public.client_videos (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  month date not null,
  slot integer not null,
  status text not null check (status in ('verstuurd','geplaatst')),
  sent_at timestamptz,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (client_id, month, slot)
);
alter table public.client_videos enable row level security;
create policy "Videos staff all" on public.client_videos for all to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
