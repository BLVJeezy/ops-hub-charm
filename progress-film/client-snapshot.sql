-- Monthly report for one client: one row, one JSON object. Read-only; counts only (no names, e-mails or phone numbers of the client's customers).
-- Replace {{CLIENT_ID}}, {{FROM}} and {{TO}} (dates, inclusive) before running.
with p as (select '{{CLIENT_ID}}'::uuid as cid, '{{FROM}}'::date as d0, '{{TO}}'::date as d1),
     s as (select m.id, m.name, m.url, m.last_status, m.last_response_ms, m.last_backup_at from monitored_sites m, p where m.client_id = p.cid and m.enabled)
select jsonb_build_object(
  'mode', 'client', 'from', (select d0 from p), 'to', (select d1 from p),
  'client', (select jsonb_build_object('id', c.id, 'name', c.name, 'brand_color', c.brand_color, 'videos_per_month', c.social_videos_per_month) from clients c, p where c.id = p.cid),
  'sites', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'url', url, 'status', last_status, 'ms', last_response_ms, 'backup', last_backup_at)), '[]') from s),
  'visits_daily', (select coalesce(jsonb_agg(jsonb_build_object('day', day, 'visitors', v, 'pageviews', pv) order by day), '[]') from (select d.day, sum(d.visitors) v, sum(d.pageviews) pv from site_visits_daily d, p where d.site_id in (select id from s) and d.day between p.d0 and p.d1 group by 1) x),
  'visits_prev', (select coalesce(sum(d.visitors), 0) from site_visits_daily d, p where d.site_id in (select id from s) and d.day between p.d0 - (p.d1 - p.d0 + 1) and p.d0 - 1),
  'prev_days', (select count(distinct d.day) from site_visits_daily d, p where d.site_id in (select id from s) and d.day between p.d0 - (p.d1 - p.d0 + 1) and p.d0 - 1),
  'pages', (select coalesce(jsonb_agg(jsonb_build_object('path', path, 'views', v) order by v desc), '[]') from (select d.path, sum(d.views) v from site_pages_daily d, p where d.site_id in (select id from s) and d.day between p.d0 and p.d1 group by 1 order by 2 desc limit 6) x),
  'sources', (select coalesce(jsonb_agg(jsonb_build_object('source', source, 'views', v) order by v desc), '[]') from (select d.source, sum(d.views) v from site_sources_daily d, p where d.site_id in (select id from s) and d.day between p.d0 and p.d1 group by 1 order by 2 desc limit 5) x),
  'devices', (select coalesce(jsonb_agg(jsonb_build_object('label', label, 'value', v) order by v desc), '[]') from (select d.label, sum(d.value) v from site_breakdown_daily d, p where d.site_id in (select id from s) and d.dim = 'device' and d.day between p.d0 and p.d1 group by 1) x),
  'records', (select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'n', n) order by n desc), '[]') from (select r.kind, count(*) n from site_records r, p where r.site_id in (select id from s) and r.kind <> 'blokkade' and coalesce(r.source_created_at, r.starts_at)::date between p.d0 and p.d1 group by 1) x),
  'records_daily', (select coalesce(jsonb_agg(jsonb_build_object('day', day, 'n', n) order by day), '[]') from (select coalesce(r.source_created_at, r.starts_at)::date as day, count(*) n from site_records r, p where r.site_id in (select id from s) and r.kind <> 'blokkade' and coalesce(r.source_created_at, r.starts_at)::date between p.d0 and p.d1 group by 1) x),
  'records_prev', (select count(*) from site_records r, p where r.site_id in (select id from s) and r.kind <> 'blokkade' and coalesce(r.source_created_at, r.starts_at)::date between p.d0 - (p.d1 - p.d0 + 1) and p.d0 - 1),
  'videos', (select jsonb_build_object('sent', count(*) filter (where v.sent_at::date between p.d0 and p.d1), 'posted', count(*) filter (where v.posted_at::date between p.d0 and p.d1)) from client_videos v, p where v.client_id = p.cid),
  'incidents', (select count(*) from incidents i, p where i.site_id in (select id from s) and i.opened_at::date between p.d0 and p.d1),
  'tasks_done', (select count(*) from client_tasks t, p where t.client_id = p.cid and t.done_at::date between p.d0 and p.d1)
) as snapshot;
