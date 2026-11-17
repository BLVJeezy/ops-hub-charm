-- The Hub assistant's company knowledge: one free-text document the owner edits in the Hub (services, prices, rules,
-- how each client is handled). The assistant reads it with every question and can add a line when asked to remember something.
create table if not exists public.assistant_knowledge (
  key text primary key default 'company',
  body text not null default '',
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table public.assistant_knowledge enable row level security;
drop policy if exists "Assistant knowledge staff all" on public.assistant_knowledge;
create policy "Assistant knowledge staff all" on public.assistant_knowledge for all to authenticated
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

insert into public.assistant_knowledge (key, body) values ('company', '') on conflict (key) do nothing;
