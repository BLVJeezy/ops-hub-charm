-- Agenda: mark a block or appointment as done, not done or cancelled, and move it.
alter table public.calendar_busy
  add column if not exists outcome text check (outcome in ('done', 'missed', 'cancelled')),
  add column if not exists moved_from timestamptz,
  add column if not exists edited_at timestamptz;
alter table public.bookings
  add column if not exists outcome text check (outcome in ('done', 'missed')),
  add column if not exists moved_from timestamptz;
