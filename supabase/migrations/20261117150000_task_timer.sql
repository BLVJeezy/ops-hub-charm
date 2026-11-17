-- A timer on every task: time worked, how often work was picked up again after a stop (breaks), and for tasks made of
-- several pieces (3 videos) how many are done and how long each took.
alter table public.client_tasks
  add column if not exists started_at timestamptz,                     -- set while the timer runs
  add column if not exists seconds integer not null default 0,         -- time worked before the current run
  add column if not exists breaks integer not null default 0,
  add column if not exists steps_total integer,
  add column if not exists steps_done integer not null default 0,
  add column if not exists laps jsonb not null default '[]'::jsonb;     -- seconds on the clock when each piece was finished
alter table public.client_recurring_tasks add column if not exists steps integer;

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
        insert into public.client_tasks (client_id, title, assignee, due_date, recurring_id, created_by, steps_total) values (r.client_id, r.title, r.assignee, d, r.id, r.created_by, r.steps);
        n := n + 1;
      end if;
      d := d + 1;
    end loop;
    update public.client_recurring_tasks set generated_until = horizon where id = r.id and (generated_until is null or generated_until < horizon);
  end loop;
  return n;
end $$;
