-- When I last sent a booking to my Google Calendar with the button (reset when the booking moves).
alter table public.bookings add column if not exists gcal_sent_at timestamptz;
