-- The Agenda page in the Hub shows what each calendar item is, in the client's colour.
-- Only staff can read these columns; the public booking page still gets start and end times only.
alter table public.calendar_busy add column if not exists title text;
alter table public.calendar_busy add column if not exists kind text not null default 'other';
alter table public.calendar_busy add column if not exists client_id uuid references public.clients(id) on delete set null;
