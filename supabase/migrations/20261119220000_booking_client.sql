-- A booking made through a client's own request link is tied to that client (colour in the Agenda, client profile).
alter table public.bookings add column if not exists client_id uuid references public.clients(id) on delete set null;
create index if not exists bookings_client on public.bookings (client_id);
