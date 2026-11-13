-- Visitor statistics from the hosting platform (Lovable Cloud analytics or Vercel Web Analytics),
-- copied into Hub OS once a day so the history is kept here. Re-runnable.

ALTER TABLE public.monitored_sites
  ADD COLUMN IF NOT EXISTS analytics_provider text NOT NULL DEFAULT 'none', -- lovable | vercel | hub | none
  ADD COLUMN IF NOT EXISTS lovable_project_id text,
  ADD COLUMN IF NOT EXISTS analytics_synced_at timestamptz;

ALTER TABLE public.site_visits_daily
  ADD COLUMN IF NOT EXISTS bounce_rate numeric,       -- %
  ADD COLUMN IF NOT EXISTS session_seconds numeric,   -- average
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'hub';

-- Devices, countries (and anything else) per day.
CREATE TABLE IF NOT EXISTS public.site_breakdown_daily (
  site_id uuid NOT NULL REFERENCES public.monitored_sites(id) ON DELETE CASCADE,
  day date NOT NULL,
  dim text NOT NULL,      -- device | country
  label text NOT NULL,
  value integer NOT NULL DEFAULT 0,
  PRIMARY KEY (site_id, day, dim, label)
);
ALTER TABLE public.site_breakdown_daily ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Breakdown read staff" ON public.site_breakdown_daily;
CREATE POLICY "Breakdown read staff" ON public.site_breakdown_daily FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

NOTIFY pgrst, 'reload schema';
