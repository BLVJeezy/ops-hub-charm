-- Growth ideas: twice a day a scheduled Claude run scans every client site and proposes
-- one improvement per site (SEO, findability, marketing, conversion) with a ready prompt.
-- The owner edits the prompt and presses Deploy; an hourly Claude run builds it on a
-- separate branch (never on the live site), and the owner confirms (goes live) or cancels.
CREATE TABLE IF NOT EXISTS public.growth_ideas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid REFERENCES public.monitored_sites(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  batch text NOT NULL,                       -- e.g. '2026-11-22 ochtend'
  area text NOT NULL DEFAULT 'seo' CHECK (area IN ('seo','vindbaarheid','marketing','conversie','snelheid','content','techniek')),
  impact text NOT NULL DEFAULT 'middel' CHECK (impact IN ('hoog','middel','laag')),
  kind text NOT NULL DEFAULT 'code' CHECK (kind IN ('code','tip')),   -- code = Claude can build it in the repo; tip = something you do yourself
  title text NOT NULL,
  why text NOT NULL,                         -- what the scan found, in plain Dutch
  findings jsonb NOT NULL DEFAULT '[]',      -- the scan facts behind it
  prompt text NOT NULL,                      -- draft instruction for Claude
  status text NOT NULL DEFAULT 'voorgesteld' CHECK (status IN (
    'voorgesteld','ingepland','bezig','ter_controle','live_zetten','live','annuleren','geannuleerd','overgeslagen','mislukt')),
  approved_prompt text,
  approved_at timestamptz,
  approved_by uuid,
  started_at timestamptz,
  branch text,
  preview_url text,
  diff_url text,
  result_summary text,
  review_at timestamptz,                     -- when it became ready to check
  decided_at timestamptz,                    -- confirm or cancel pressed
  finished_at timestamptz,                   -- live, cancelled or failed
  error text,
  task_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS growth_ideas_status_idx ON public.growth_ideas(status, created_at DESC);
CREATE INDEX IF NOT EXISTS growth_ideas_site_idx ON public.growth_ideas(site_id, created_at DESC);
ALTER TABLE public.growth_ideas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Ideas staff all" ON public.growth_ideas;
CREATE POLICY "Ideas staff all" ON public.growth_ideas FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
DROP TRIGGER IF EXISTS growth_ideas_touch ON public.growth_ideas;
CREATE OR REPLACE FUNCTION public.growth_ideas_touch() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER growth_ideas_touch BEFORE UPDATE ON public.growth_ideas FOR EACH ROW EXECUTE FUNCTION public.growth_ideas_touch();
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.growth_ideas;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
