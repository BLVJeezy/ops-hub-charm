-- Status Hub: per-client website / API / database / deploy / email monitoring.
-- Adds tables only. Does NOT schedule anything: the cron job is a separate,
-- opt-in step documented in docs/status-hub.md.

-- 1. Monitored sites -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.monitored_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  name text NOT NULL,
  url text NOT NULL,
  hosting_provider text NOT NULL DEFAULT 'Vercel',
  repo text,
  db_provider text NOT NULL DEFAULT 'none',       -- lovable_cloud | supabase | firebase | vercel_blob | none
  db_health_url text,                             -- read-only health URL (never a write endpoint)
  db_health_apikey text,                          -- PUBLIC anon/publishable key only, never a secret key
  api_endpoints jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{ "label": "...", "url": "...", "expect_status": 200 }]
  email_domain text,                              -- Resend sending domain, used to match webhook events
  vercel_project_id text,
  is_critical boolean NOT NULL DEFAULT false,     -- booking / reservation system
  check_interval_minutes integer NOT NULL DEFAULT 15 CHECK (check_interval_minutes BETWEEN 5 AND 1440),
  enabled boolean NOT NULL DEFAULT true,
  notes text,

  -- Latest summary, written by the checker
  last_status text NOT NULL DEFAULT 'unknown',    -- up | degraded | down | unknown
  last_checked_at timestamptz,
  last_http_status integer,
  last_response_ms integer,
  last_error text,
  ssl_ok boolean,
  db_status text,                                 -- ok | fail | not_configured
  api_status text,                                -- ok | fail | not_configured
  email_status text,                              -- ok | issues | not_configured
  last_deploy_state text,
  last_deploy_at timestamptz,
  last_deploy_url text,
  last_backup_at timestamptz,                     -- filled by the backup system (phase 1)

  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT monitored_sites_db_key_not_secret CHECK (
    db_health_apikey IS NULL OR db_health_apikey NOT LIKE 'sb_secret_%'
  )
);

CREATE INDEX IF NOT EXISTS monitored_sites_client_idx ON public.monitored_sites(client_id);

DROP TRIGGER IF EXISTS monitored_sites_updated_at ON public.monitored_sites;
CREATE TRIGGER monitored_sites_updated_at BEFORE UPDATE ON public.monitored_sites
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.monitored_sites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sites read authed" ON public.monitored_sites FOR SELECT TO authenticated USING (true);
CREATE POLICY "Sites insert admin" ON public.monitored_sites FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Sites update admin" ON public.monitored_sites FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Sites delete admin" ON public.monitored_sites FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- 2. Check history -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.health_checks (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  site_id uuid NOT NULL REFERENCES public.monitored_sites(id) ON DELETE CASCADE,
  kind text NOT NULL,                             -- http | api | db | deploy | email
  target text,
  ok boolean NOT NULL,
  status_code integer,
  response_ms integer,
  error text,
  checked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS health_checks_site_time_idx ON public.health_checks(site_id, checked_at DESC);

ALTER TABLE public.health_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Checks read authed" ON public.health_checks FOR SELECT TO authenticated USING (true);
-- Writes happen only server-side with the service role.

-- 3. Incidents -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.monitored_sites(id) ON DELETE CASCADE,
  kind text NOT NULL,                             -- http | api | db | deploy | email
  severity text NOT NULL CHECK (severity IN ('critical','warning','info')),
  title text NOT NULL,
  detail text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  opened_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  last_notified_at timestamptz,
  notify_count integer NOT NULL DEFAULT 0,
  resolution_note text
);
CREATE UNIQUE INDEX IF NOT EXISTS incidents_one_open_per_kind
  ON public.incidents(site_id, kind) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS incidents_opened_idx ON public.incidents(opened_at DESC);

ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Incidents read authed" ON public.incidents FOR SELECT TO authenticated USING (true);
CREATE POLICY "Incidents update admin" ON public.incidents FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- 4. Resend delivery events (no recipient addresses or subjects stored) ---------
CREATE TABLE IF NOT EXISTS public.email_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email_id text,
  type text NOT NULL,
  from_domain text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_events_domain_time_idx ON public.email_events(from_domain, created_at DESC);

ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Email events read authed" ON public.email_events FOR SELECT TO authenticated USING (true);

-- Realtime for the Status page
ALTER PUBLICATION supabase_realtime ADD TABLE public.monitored_sites;
ALTER PUBLICATION supabase_realtime ADD TABLE public.incidents;
