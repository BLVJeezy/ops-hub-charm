-- Appointments, reservations, requests and leads copied from each client site's own
-- database into Hub OS (read-only copy, synced daily). Contains end-customer contact
-- data, so only admins can read it. Re-runnable.

CREATE TABLE IF NOT EXISTS public.site_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.monitored_sites(id) ON DELETE CASCADE,
  kind text NOT NULL,              -- afspraak | reservatie | aanvraag | lead
  external_id text NOT NULL,       -- id in the client's database
  starts_at timestamptz,
  ends_at timestamptz,
  status text,
  title text,                      -- service, property, company…
  customer_name text,
  customer_email text,
  customer_phone text,
  message text,
  amount numeric,
  source text,                     -- website | airbnb | booking | …
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_created_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, kind, external_id)
);
CREATE INDEX IF NOT EXISTS site_records_site_start ON public.site_records(site_id, starts_at DESC);

ALTER TABLE public.site_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Site records admin read" ON public.site_records;
CREATE POLICY "Site records admin read" ON public.site_records
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

NOTIFY pgrst, 'reload schema';
