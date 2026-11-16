-- Fixed tasks per client (weekly or monthly). The Hub turns them into ordinary tasks a few weeks ahead, so they show
-- in every task list and can be ticked off or removed like any other task.
create table if not exists public.client_recurring_tasks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade,
  title text not null,
  cadence text not null check (cadence in ('weekly','monthly')),
  day integer not null check (day between 1 and 28),          -- weekly: 1 = Monday … 7 = Sunday; monthly: day of the month
  assignee text not null default 'me' check (assignee in ('me','client')),
  active boolean not null default true,
  generated_until date,                                        -- tasks exist up to and including this day
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.client_recurring_tasks enable row level security;
drop policy if exists "Recurring tasks staff all" on public.client_recurring_tasks;
create policy "Recurring tasks staff all" on public.client_recurring_tasks for all to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
alter table public.client_tasks add column if not exists recurring_id uuid references public.client_recurring_tasks(id) on delete set null;

-- Makes the tasks that are due in the coming weeks (2 weeks ahead for weekly, 5 for monthly). Safe to call as often as you like:
-- each day is made once, so a task you delete stays deleted.
create or replace function public.generate_recurring_tasks() returns integer
language plpgsql security definer set search_path = public as $$
declare r record; d date; n integer := 0; today date := (now() at time zone 'Europe/Brussels')::date; horizon date;
begin
  if auth.uid() is not null and not public.is_staff(auth.uid()) then raise exception 'not allowed'; end if;
  for r in select * from public.client_recurring_tasks where active loop
    horizon := today + (case when r.cadence = 'weekly' then 13 else 35 end);
    d := greatest(coalesce(r.generated_until + 1, today), today);
    while d <= horizon loop
      if (r.cadence = 'weekly' and extract(isodow from d)::int = r.day) or (r.cadence = 'monthly' and extract(day from d)::int = r.day) then
        insert into public.client_tasks (client_id, title, assignee, due_date, recurring_id, created_by) values (r.client_id, r.title, r.assignee, d, r.id, r.created_by);
        n := n + 1;
      end if;
      d := d + 1;
    end loop;
    update public.client_recurring_tasks set generated_until = horizon where id = r.id and (generated_until is null or generated_until < horizon);
  end loop;
  return n;
end $$;
revoke all on function public.generate_recurring_tasks() from public, anon;
grant execute on function public.generate_recurring_tasks() to authenticated;
