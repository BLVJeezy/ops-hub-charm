REVOKE ALL ON public.monitored_sites, public.health_checks, public.incidents, public.email_events FROM anon;
REVOKE ALL ON public.health_checks, public.incidents, public.email_events FROM authenticated;
GRANT SELECT ON public.health_checks, public.email_events TO authenticated;
GRANT SELECT, UPDATE ON public.incidents TO authenticated;
NOTIFY pgrst, 'reload schema';