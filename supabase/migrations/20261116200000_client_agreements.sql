-- Samenwerkingsovereenkomsten per klant (Boekhouding → Overeenkomsten).
create table if not exists public.client_agreements (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  reference text not null,
  title text not null,
  kind text not null default 'social_media',
  body text not null,
  status text not null default 'Concept' check (status in ('Concept', 'Verstuurd', 'Ondertekend', 'Beëindigd')),
  start_date date,
  monthly_fee numeric(10,2),
  signed_at date,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists client_agreements_reference_key on public.client_agreements (reference);
create index if not exists client_agreements_client_idx on public.client_agreements (client_id);

alter table public.client_agreements enable row level security;
create policy "Agreements staff read" on public.client_agreements for select to authenticated using (public.is_staff(auth.uid()));
create policy "Agreements staff insert" on public.client_agreements for insert to authenticated with check (public.is_staff(auth.uid()));
create policy "Agreements staff update" on public.client_agreements for update to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
create policy "Agreements admin delete" on public.client_agreements for delete to authenticated using (public.has_role(auth.uid(), 'admin'));

drop trigger if exists trg_client_agreements_updated on public.client_agreements;
create trigger trg_client_agreements_updated before update on public.client_agreements
  for each row execute function public.update_updated_at_column();
