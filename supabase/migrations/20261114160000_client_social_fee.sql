-- Third recurring service per client, next to website and SEO: social media marketing (billed monthly).
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS social_monthly_fee numeric,
  ADD COLUMN IF NOT EXISTS social_setup_fee numeric,
  ADD COLUMN IF NOT EXISTS social_start_date date,
  ADD COLUMN IF NOT EXISTS social_end_date date;
