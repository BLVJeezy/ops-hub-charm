alter table public.client_documents add column if not exists title text;
alter table public.client_documents add column if not exists document_date date;
alter table public.client_documents add column if not exists last_sent_at timestamptz;
alter table public.client_documents add column if not exists last_sent_to text;

create policy "Client documents update authed"
  on public.client_documents for update to authenticated using (true) with check (true);