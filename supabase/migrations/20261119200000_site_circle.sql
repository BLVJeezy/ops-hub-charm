-- Sites can belong to a client or to family (apps BLV runs for relatives, not billed clients).
alter table public.monitored_sites
  add column if not exists circle text not null default 'client' check (circle in ('client', 'family'));
