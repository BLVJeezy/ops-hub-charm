-- Seed: Buckinx Lepalo BV — client + draft invoice
-- Run this via Lovable Cloud → SQL Editor

-- Step 1: Insert client
INSERT INTO public.clients (
  name,
  sector,
  location,
  status,
  pipeline_stage,
  health,
  vat_number,
  billing_address,
  monthly_fee,
  seo_package,
  website_needed,
  notes
) VALUES (
  'Buckinx Lepalo BV',
  'Other',
  'Tongeren',
  'Active',
  'Converted',
  'Not set',
  'BE 0889.490.592',
  'Klerebroek 46, 3700 Tongeren',
  85,
  'Basic',
  false,
  'Besloten vennootschap, opgericht 08/05/2007. Maandelijks marketingpakket €85/mnd.'
);

-- Step 2: Insert draft invoice linked to that client
INSERT INTO public.invoices (
  client,
  client_name,
  client_address,
  client_vat_number,
  date,
  status,
  vat_note,
  line_items
)
SELECT
  id,
  'Buckinx Lepalo BV',
  'Klerebroek 46, 3700 Tongeren',
  'BE 0889.490.592',
  CURRENT_DATE,
  'Draft',
  'BTW (0% - Reverse Charge)',
  '[{"description": "Maandelijkse marketing & SEO-begeleiding", "price": 85}]'::jsonb
FROM public.clients
WHERE name = 'Buckinx Lepalo BV'
ORDER BY created_at DESC
LIMIT 1;
