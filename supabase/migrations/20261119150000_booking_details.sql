-- Bookings: online or on location (with the address), and files the client adds (photos, PDFs).
alter table public.bookings add column if not exists mode text not null default 'online' check (mode in ('online', 'onsite'));
alter table public.bookings add column if not exists location text;
alter table public.bookings add column if not exists attachments jsonb not null default '[]'::jsonb;

-- Private bucket for those files. The public page uploads through the server; only staff can read them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('booking-files', 'booking-files', false, 8388608, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])
on conflict (id) do nothing;
drop policy if exists "booking-files staff read" on storage.objects;
create policy "booking-files staff read" on storage.objects for select to authenticated using (bucket_id = 'booking-files' and public.is_staff(auth.uid()));
alter table public.bookings add column if not exists topics text[] not null default '{}';
