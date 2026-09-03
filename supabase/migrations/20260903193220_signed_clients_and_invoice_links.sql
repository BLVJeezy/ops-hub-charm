-- Use the business-facing "Signed" stage and keep existing converted clients intact.
ALTER TYPE public.pipeline_stage RENAME VALUE 'Converted' TO 'Signed';

-- MarketBase is an actual signed client and must appear on the Clients page.
UPDATE public.clients
SET status = 'Active', pipeline_stage = 'Signed', updated_at = now()
WHERE regexp_replace(lower(name), '[^a-z0-9]', '', 'g') = 'marketbase';

-- Repair historic invoices that stored only a client name instead of the client id.
-- Only link a name when it identifies exactly one client.
WITH unique_clients AS (
  SELECT
    min(id::text)::uuid AS id,
    regexp_replace(lower(trim(name)), '[^a-z0-9]', '', 'g') AS normalized_name
  FROM public.clients
  GROUP BY regexp_replace(lower(trim(name)), '[^a-z0-9]', '', 'g')
  HAVING count(*) = 1
)
UPDATE public.invoices AS invoice
SET client = unique_clients.id, updated_at = now()
FROM unique_clients
WHERE invoice.client IS NULL
  AND invoice.client_name IS NOT NULL
  AND regexp_replace(lower(trim(invoice.client_name)), '[^a-z0-9]', '', 'g') = unique_clients.normalized_name;
