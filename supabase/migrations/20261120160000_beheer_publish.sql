-- Beheerpagina's van klantsites (/beheer.html): wat de klant publiceert, en eerdere versies.
-- Alleen de server (service role) schrijft, via /api/public/beheer. Staff kan meelezen in de Hub.
create table if not exists public.beheer_content (
  site text primary key,
  content jsonb not null default '{}'::jsonb,
  published_at timestamptz not null default now()
);
create table if not exists public.beheer_versions (
  id uuid primary key default gen_random_uuid(),
  site text not null,
  content jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists beheer_versions_site on public.beheer_versions (site, created_at desc);
alter table public.beheer_content enable row level security;
alter table public.beheer_versions enable row level security;
drop policy if exists "Beheer content staff read" on public.beheer_content;
create policy "Beheer content staff read" on public.beheer_content for select to authenticated using (public.is_staff(auth.uid()));
drop policy if exists "Beheer versions staff read" on public.beheer_versions;
create policy "Beheer versions staff read" on public.beheer_versions for select to authenticated using (public.is_staff(auth.uid()));

-- Openbare map voor de foto's die klanten in het beheer vervangen (alleen de server uploadt).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('beheer', 'beheer', true, 4194304, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
