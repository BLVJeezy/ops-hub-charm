-- Solyn Global progress snapshot: one row, one JSON object. Read-only; aggregates only (no customer names, e-mails or phone numbers of our clients' customers).
select jsonb_build_object(
  'day', (now() at time zone 'Europe/Brussels')::date,
  'clients', (select coalesce(jsonb_agg(to_jsonb(c) order by c.name), '[]') from (
      select id, name, sector, status, pipeline_stage, brand_color, created_at::date as created, contract_start_date,
             website_needed, website_billing_frequency, website_setup_fee, website_monthly_fee, website_yearly_fee,
             billing_frequency, monthly_fee, yearly_fee, setup_fee, seo_start_date, seo_end_date,
             social_monthly_fee, social_setup_fee, social_start_date, social_end_date, social_videos_per_month
      from clients where coalesce(is_internal, false) = false) c),
  'invoices', (select coalesce(jsonb_agg(to_jsonb(v) order by v.date), '[]') from (
      select i.id, i.client, i.client_name, i.date, i.total, i.status, i.line_items, i.scheduled_send_at, i.repeat_monthly, i.repeat_day, i.next_repeat_on, i.repeat_parent
      from invoices i left join clients c on c.id = i.client where coalesce(c.is_internal, false) = false) v),
  'expenses', (select coalesce(jsonb_agg(jsonb_build_object('category', category, 'monthly', m) order by m desc), '[]') from (select coalesce(category, 'Other') category, sum(monthly_cost) m from expenses group by 1) e),
  'sites', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'client_id', client_id, 'status', last_status, 'ms', last_response_ms, 'backup', last_backup_at) order by name), '[]') from monitored_sites where enabled),
  'visits_weekly', (select coalesce(jsonb_agg(jsonb_build_object('week', w, 'visitors', v, 'pageviews', p) order by w), '[]') from (select date_trunc('week', day)::date w, sum(visitors) v, sum(pageviews) p from site_visits_daily where day >= current_date - 83 group by 1) x),
  'visits_site_30d', (select coalesce(jsonb_agg(jsonb_build_object('name', s.name, 'client_id', s.client_id, 'visitors', x.v) order by x.v desc), '[]') from (select site_id, sum(visitors) v from site_visits_daily where day >= current_date - 29 group by 1) x join monitored_sites s on s.id = x.site_id),
  'records_weekly', (select coalesce(jsonb_agg(jsonb_build_object('week', w, 'kind', kind, 'n', n) order by w), '[]') from (select date_trunc('week', coalesce(source_created_at, starts_at))::date w, kind, count(*) n from site_records where kind <> 'blokkade' and coalesce(source_created_at, starts_at) >= current_date - 83 group by 1, 2) x),
  'records_total', (select coalesce(jsonb_object_agg(kind, n), '{}') from (select kind, count(*) n from site_records where kind <> 'blokkade' group by 1) x),
  'tasks', (select jsonb_build_object('open', count(*) filter (where done_at is null), 'overdue', count(*) filter (where done_at is null and due_date < current_date), 'done_7d', count(*) filter (where done_at >= now() - interval '7 days')) from client_tasks),
  'videos_month', (select coalesce(jsonb_agg(jsonb_build_object('client_id', client_id, 'sent', s, 'posted', p)), '[]') from (select client_id, count(*) filter (where sent_at is not null) s, count(*) filter (where posted_at is not null) p from client_videos where month::text like to_char(current_date, 'YYYY-MM') || '%' group by 1) x),
  'incidents', (select jsonb_build_object('open', count(*) filter (where resolved_at is null), 'last_30d', count(*) filter (where opened_at >= now() - interval '30 days')) from incidents)
) as snapshot;
