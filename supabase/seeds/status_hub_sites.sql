-- Seed: first monitored sites for the Status Hub (Riory, Belgomed, Villa Amano).
-- Run AFTER the status_hub migration. Safe to re-run: existing sites (matched by URL) are updated, not duplicated.
-- The db_health_apikey values are the PUBLIC anon keys already shipped in each site's frontend code.
-- Client links are matched by name; if no matching client row exists the site is added unlinked.

INSERT INTO public.monitored_sites
  (client_id, name, url, hosting_provider, repo, db_provider, db_health_url, db_health_apikey,
   api_endpoints, email_domain, is_critical, check_interval_minutes, enabled, notes)
SELECT
  (SELECT id FROM public.clients WHERE name ILIKE v.client_name ORDER BY created_at LIMIT 1),
  v.name, v.url, v.hosting, v.repo, v.db_provider, v.db_health_url, v.db_health_apikey,
  v.api_endpoints::jsonb, v.email_domain, v.is_critical, v.interval_min, true, v.notes
FROM (VALUES
  ('Riory%', 'Riory', 'https://www.riory.be', 'Vercel', 'BLVJeezy/riory', 'lovable_cloud',
   'https://bqcxvvpawbwupornueww.supabase.co/auth/v1/health',
   'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxY3h2dnBhd2J3dXBvcm51ZXd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwOTQyNTUsImV4cCI6MjA4ODY3MDI1NX0.4XUjKVlt6mk98sIpvR06Zo2m5gL5txCpa3EQIvWmWrc',
   '[]', 'riory.be', true, 15,
   'Appointments are the main KPI, so marked critical. Add the Vercel project ID once VERCEL_TOKEN is set.'),
  ('Belgomed%', 'Belgomed', 'https://belgomed.com', 'Vercel', 'BLVJeezy/Belgomed-V2', 'lovable_cloud',
   'https://qjhyojwdvhkwwfvplaab.supabase.co/auth/v1/health',
   'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqaHlvandkdmhrd3dmdnBsYWFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2OTUyNzAsImV4cCI6MjA4NzI3MTI3MH0.40FcJoWk4W6Dtd5b1RzbzNblvQJ4SYab7qDKVHbxudc',
   '[]', NULL, false, 15,
   'Confirm Belgomed-V2 is the live repo. Add the Vercel project ID once VERCEL_TOKEN is set.'),
  ('Villa Amano%', 'Villa Amano', 'https://hotel-bilzen.vercel.app', 'Vercel', 'BLVJeezy/hotel-bilzen', 'vercel_blob',
   'https://hotel-bilzen.vercel.app/api/ops?a=status', NULL,
   '[{"label":"Availability","url":"https://hotel-bilzen.vercel.app/api/availability"}]',
   NULL, true, 10,
   'Booking system. Data lives in a private Vercel Blob store; the status endpoint reports store:false if Blob is disconnected. Update the URL when the custom domain goes live.')
) AS v(client_name, name, url, hosting, repo, db_provider, db_health_url, db_health_apikey,
       api_endpoints, email_domain, is_critical, interval_min, notes)
WHERE NOT EXISTS (SELECT 1 FROM public.monitored_sites s WHERE s.url = v.url);
