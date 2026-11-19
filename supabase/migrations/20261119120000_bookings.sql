-- Public booking page (/afspraak): clients pick a free hour for a meeting.
-- calendar_busy holds when the owner is busy, copied from Google Calendar by a scheduled task.
-- bookings holds the meetings clients booked. The public page reads and writes only through the server.
create table if not exists public.calendar_busy (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  source text not null default 'google',
  synced_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists calendar_busy_starts on public.calendar_busy (starts_at);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  company text,
  note text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  google_event_id text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
-- one confirmed meeting per start time: two people can never get the same hour
create unique index if not exists bookings_one_per_slot on public.bookings (starts_at) where status = 'confirmed';

alter table public.calendar_busy enable row level security;
alter table public.bookings enable row level security;
drop policy if exists "Calendar busy staff all" on public.calendar_busy;
create policy "Calendar busy staff all" on public.calendar_busy for all to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
drop policy if exists "Bookings staff all" on public.bookings;
create policy "Bookings staff all" on public.bookings for all to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
