-- Cookieless visitor statistics per monitored site.
-- A tiny script on each client site (served by Hub OS at /t.js) posts one hit per page view.
-- Only daily totals, pages and sources are kept. A visitor is counted once per day through a
-- hash that changes every day; no IP address, cookie or device identifier is stored. Re-runnable.

ALTER TABLE public.monitored_sites
  ADD COLUMN IF NOT EXISTS tracking_id text;
UPDATE public.monitored_sites SET tracking_id = replace(gen_random_uuid()::text, '-', '') WHERE tracking_id IS NULL;
ALTER TABLE public.monitored_sites ALTER COLUMN tracking_id SET DEFAULT replace(gen_random_uuid()::text, '-', '');
ALTER TABLE public.monitored_sites ALTER COLUMN tracking_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS monitored_sites_tracking_id_key ON public.monitored_sites(tracking_id);

CREATE TABLE IF NOT EXISTS public.site_visits_daily (
  site_id uuid NOT NULL REFERENCES public.monitored_sites(id) ON DELETE CASCADE,
  day date NOT NULL,
  pageviews integer NOT NULL DEFAULT 0,
  visitors integer NOT NULL DEFAULT 0,
  PRIMARY KEY (site_id, day)
);
CREATE TABLE IF NOT EXISTS public.site_pages_daily (
  site_id uuid NOT NULL REFERENCES public.monitored_sites(id) ON DELETE CASCADE,
  day date NOT NULL,
  path text NOT NULL,
  views integer NOT NULL DEFAULT 0,
  PRIMARY KEY (site_id, day, path)
);
CREATE TABLE IF NOT EXISTS public.site_sources_daily (
  site_id uuid NOT NULL REFERENCES public.monitored_sites(id) ON DELETE CASCADE,
  day date NOT NULL,
  source text NOT NULL,
  views integer NOT NULL DEFAULT 0,
  PRIMARY KEY (site_id, day, source)
);
-- Short-lived (today + yesterday) daily-rotating hashes, only to count unique visitors.
CREATE TABLE IF NOT EXISTS public.site_visitor_hashes (
  site_id uuid NOT NULL REFERENCES public.monitored_sites(id) ON DELETE CASCADE,
  day date NOT NULL,
  hash text NOT NULL,
  PRIMARY KEY (site_id, day, hash)
);

ALTER TABLE public.site_visits_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_pages_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_sources_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_visitor_hashes ENABLE ROW LEVEL SECURITY; -- no policies: server only

DROP POLICY IF EXISTS "Visits read staff" ON public.site_visits_daily;
CREATE POLICY "Visits read staff" ON public.site_visits_daily FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "Pages read staff" ON public.site_pages_daily;
CREATE POLICY "Pages read staff" ON public.site_pages_daily FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "Sources read staff" ON public.site_sources_daily;
CREATE POLICY "Sources read staff" ON public.site_sources_daily FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

-- One page view. Called only by the Hub server (service role).
CREATE OR REPLACE FUNCTION public.track_pageview(_tracking_id text, _day date, _hash text, _path text, _source text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  sid uuid;
  is_new boolean := false;
BEGIN
  SELECT id INTO sid FROM public.monitored_sites WHERE tracking_id = _tracking_id;
  IF sid IS NULL THEN RETURN false; END IF;

  INSERT INTO public.site_visitor_hashes(site_id, day, hash) VALUES (sid, _day, _hash)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS is_new = ROW_COUNT;

  INSERT INTO public.site_visits_daily(site_id, day, pageviews, visitors)
  VALUES (sid, _day, 1, CASE WHEN is_new THEN 1 ELSE 0 END)
  ON CONFLICT (site_id, day) DO UPDATE
    SET pageviews = site_visits_daily.pageviews + 1,
        visitors = site_visits_daily.visitors + CASE WHEN is_new THEN 1 ELSE 0 END;

  INSERT INTO public.site_pages_daily(site_id, day, path, views) VALUES (sid, _day, left(_path, 200), 1)
  ON CONFLICT (site_id, day, path) DO UPDATE SET views = site_pages_daily.views + 1;

  INSERT INTO public.site_sources_daily(site_id, day, source, views) VALUES (sid, _day, left(_source, 100), 1)
  ON CONFLICT (site_id, day, source) DO UPDATE SET views = site_sources_daily.views + 1;

  RETURN true;
END $$;
REVOKE EXECUTE ON FUNCTION public.track_pageview(text, date, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.track_pageview(text, date, text, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
