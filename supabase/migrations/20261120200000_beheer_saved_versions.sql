-- Beheer: een versie bewaren zonder ze te publiceren.
alter table public.beheer_versions add column if not exists kind text not null default 'published';
alter table public.beheer_versions drop constraint if exists beheer_versions_kind;
alter table public.beheer_versions add constraint beheer_versions_kind check (kind in ('published', 'saved'));
