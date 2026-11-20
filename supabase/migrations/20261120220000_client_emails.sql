-- Every mail the Hub sends to a client, and what happened to it (from Resend): sent, delivered, bounced, opened.
create table if not exists public.client_emails (
  id uuid primary key default gen_random_uuid(),
  resend_id text unique,
  client_id uuid references public.clients(id) on delete set null,
  to_email text not null,
  subject text not null,
  kind text not null,
  ref_id text,
  status text not null default 'sent' check (status in ('failed', 'sent', 'delayed', 'delivered', 'opened', 'clicked', 'bounced', 'complained')),
  status_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  bounced_at timestamptz,
  error text,
  checked_at timestamptz,
  sent_at timestamptz not null default now()
);
create index if not exists client_emails_client on public.client_emails (client_id, sent_at desc);
create index if not exists client_emails_pending on public.client_emails (sent_at) where status in ('sent', 'delayed');
alter table public.client_emails enable row level security;
drop policy if exists "Client emails staff read" on public.client_emails;
create policy "Client emails staff read" on public.client_emails for select to authenticated using (public.is_staff(auth.uid()));

select cron.schedule('email-status-sync', '*/10 * * * *', $cmd$
  SELECT net.http_post(
    url := 'https://project--82da2251-738e-4633-9ced-6f4036c59715.lovable.app/api/public/hooks/email-status',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key')),
    body := '{}'::jsonb, timeout_milliseconds := 60000);
$cmd$);
