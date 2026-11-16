-- A colour per client (used in Brain, lists and charts) and a flag for Solyn's own account,
-- which is used for testing and is not a customer.
alter table public.clients add column if not exists brand_color text;
alter table public.clients add column if not exists is_internal boolean not null default false;
