-- A client can be a sub-company of another client (Nuance Therapy belongs to the owners of Villa Amano).
-- The Perks ring on the Brain hangs it under its parent instead of on the main circle.
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS parent_client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;
ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_parent_not_self;
ALTER TABLE public.clients ADD CONSTRAINT clients_parent_not_self CHECK (parent_client_id IS NULL OR parent_client_id <> id);
