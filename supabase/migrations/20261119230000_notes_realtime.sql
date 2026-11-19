-- In-Hub notifications listen live for new bookings and client requests (RLS still applies: staff only).
alter publication supabase_realtime add table public.bookings;
alter publication supabase_realtime add table public.client_requests;
