-- Launch checklist per client website: pages, domain, e-mail, SEO, handover.
-- Template items live in code (src/lib/site-checklist.ts); a row only exists once something is ticked,
-- marked n.v.t., checked automatically, or added as an extra item (label set).
CREATE TABLE IF NOT EXISTS public.client_checklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  key text NOT NULL,
  label text,
  grp text,
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','klaar','nvt')),
  note text,
  auto_state text CHECK (auto_state IN ('ok','mis')),
  auto_detail text,
  auto_at timestamptz,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, key)
);
ALTER TABLE public.client_checklist ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Checklist staff all" ON public.client_checklist;
CREATE POLICY "Checklist staff all" ON public.client_checklist FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
