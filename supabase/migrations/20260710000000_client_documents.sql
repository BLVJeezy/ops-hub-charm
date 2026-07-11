-- Client documents / reports feature
-- Lets team members upload files (e.g. SEO reports made in Claude) to a client record.

insert into storage.buckets (id, name, public)
values ('client-documents', 'client-documents', false)
on conflict (id) do nothing;

create table if not exists public.client_documents (
  id uuid primary key default gen_random_uuid(),
  client uuid not null references public.clients(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  file_size bigint,
  content_type text,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.client_documents enable row level security;

create policy "Client documents read all authed"
  on public.client_documents for select to authenticated using (true);

create policy "Client documents insert authed"
  on public.client_documents for insert to authenticated with check (true);

create policy "Client documents delete admin"
  on public.client_documents for delete to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- Editable display title and document date, plus send-log tracking
alter table public.client_documents add column if not exists title text;
alter table public.client_documents add column if not exists document_date date;
alter table public.client_documents add column if not exists last_sent_at timestamptz;
alter table public.client_documents add column if not exists last_sent_to text;

-- Allow authenticated users to update their own uploaded documents (title/date/send tracking)
create policy "Client documents update authed"
  on public.client_documents for update to authenticated using (true) with check (true);

create policy "client-documents read authed"
  on storage.objects for select to authenticated
  using (bucket_id = 'client-documents');

create policy "client-documents insert authed"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'client-documents');

create policy "client-documents delete admin"
  on storage.objects for delete to authenticated
  using (bucket_id = 'client-documents' and public.has_role(auth.uid(), 'admin'));
