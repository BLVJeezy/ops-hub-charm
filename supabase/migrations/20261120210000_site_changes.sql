-- Every publish from a client's beheerpagina, and what changed in it field by field, so I can follow up and undo.
create table if not exists public.site_change_batches (
  id uuid primary key default gen_random_uuid(),
  site text not null,
  client_id uuid references public.clients(id) on delete set null,
  version_id uuid,
  prev_version_id uuid,
  action text not null default 'publish' check (action in ('publish', 'restore', 'undo')),
  by_whom text not null default 'klant' check (by_whom in ('klant', 'solyn')),
  changes int not null default 0,
  flags text[] not null default '{}',
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists site_change_batches_site on public.site_change_batches (site, created_at desc);
create index if not exists site_change_batches_open on public.site_change_batches (created_at desc) where reviewed_at is null;

create table if not exists public.site_changes (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.site_change_batches(id) on delete cascade,
  kind text not null check (kind in ('text', 'img', 'contact')),
  key text not null,
  page text,
  tag text,
  before text,
  after text,
  seo boolean not null default false,
  why text[] not null default '{}'
);
create index if not exists site_changes_batch on public.site_changes (batch_id);

alter table public.site_change_batches enable row level security;
alter table public.site_changes enable row level security;
drop policy if exists "Site change batches staff" on public.site_change_batches;
create policy "Site change batches staff" on public.site_change_batches for all to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
drop policy if exists "Site changes staff read" on public.site_changes;
create policy "Site changes staff read" on public.site_changes for select to authenticated using (public.is_staff(auth.uid()));
alter publication supabase_realtime add table public.site_change_batches;
