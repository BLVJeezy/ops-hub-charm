-- Seed: first monitored sites for the Status Hub.
-- Run once via Lovable Cloud → SQL Editor AFTER the status_hub migration is applied.
-- Safe to re-run: skips sites whose URL already exists.
-- Client links are matched by name; if a client row doesn't exist the site is added unlinked.

INSERT INTO public.monitored_sites
  (client_id, name, url, hosting_provider, repo, db_provider, db_health_url, api_endpoints, email_domain, is_critical, check_interval_minutes, notes)
SELECT
  (SELECT id FROM public.clients WHERE name ILIKE v.client_name ORDER BY created_at LIMIT 1),
  v.name, v.url, v.hosting, v.repo, v.db_provider, v.db_health_url, v.api_endpoints::jsonb, v.email_domain, v.is_critical, v.interval_min, v.notes
FROM (VALUES
  ('Riory%', 'Riory website', 'https://www.riory.be', 'Vercel', 'BLVJeezy/riory', 'lovable_cloud', NULL, '[]', NULL, false, 15,
   'DB check: set health URL https://bqcxvvpawbwupornueww.supabase.co/auth/v1/health + the public anon key from the riory repo .env (VITE_SUPABASE_PUBLISHABLE_KEY). Set the Resend domain if riory.be sends via Resend.'),
  ('Belgomed%', 'Belgomed website', 'https://belgomed.com', 'Vercel', 'BLVJeezy/Belgomed-V2', 'lovable_cloud', NULL, '[]', NULL, false, 15,
   'DB check: set health URL https://qjhyojwdvhkwwfvplaab.supabase.co/auth/v1/health + the public anon key from the Belgomed-V2 repo. Confirm Belgomed-V2 is the live repo.'),
  ('Villa Amano%', 'Villa Amano', 'https://hotel-bilzen.vercel.app', 'Vercel', 'BLVJeezy/hotel-bilzen', 'vercel_blob',
   'https://hotel-bilzen.vercel.app/api/ops?a=status',
   '[{"label":"Availability","url":"https://hotel-bilzen.vercel.app/api/availability"}]',
   NULL, true, 10,
   'Booking system. Data lives in a private Vercel Blob store; the status endpoint reports store:false if Blob is disconnected. Update the URL when the custom domain goes live.')
) AS v(client_name, name, url, hosting, repo, db_provider, db_health_url, api_endpoints, email_domain, is_critical, interval_min, notes)
WHERE NOT EXISTS (SELECT 1 FROM public.monitored_sites s WHERE s.url = v.url);
