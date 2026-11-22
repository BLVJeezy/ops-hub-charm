-- Ideas can be adjusted after Deploy (feedback round on the same branch) and rolled back after going live.
ALTER TABLE public.growth_ideas DROP CONSTRAINT IF EXISTS growth_ideas_status_check;
ALTER TABLE public.growth_ideas ADD CONSTRAINT growth_ideas_status_check CHECK (status IN (
  'voorgesteld','ingepland','bezig','ter_controle','aanpassen','live_zetten','live','terugzetten','teruggezet','annuleren','geannuleerd','overgeslagen','mislukt'));
ALTER TABLE public.growth_ideas ADD COLUMN IF NOT EXISTS feedback text;       -- what to change in the next round
ALTER TABLE public.growth_ideas ADD COLUMN IF NOT EXISTS merge_sha text;      -- merge commit on the live branch, for rollback
ALTER TABLE public.growth_ideas ADD COLUMN IF NOT EXISTS reverted_at timestamptz;
ALTER TABLE public.growth_ideas ADD COLUMN IF NOT EXISTS rounds int NOT NULL DEFAULT 0;
