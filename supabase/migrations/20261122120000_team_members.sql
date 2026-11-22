-- Team members: people who help out (employee, freelancer, someone hired for a month).
-- They get their own login and a limited portal (/team). They are NOT staff: every existing
-- table stays closed to them through RLS (is_staff). Everything they see comes through
-- server functions that return only whitelisted fields.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'member';

CREATE TABLE IF NOT EXISTS public.team_members (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text NOT NULL,
  title text,                                   -- e.g. "Video-editor", "Webdeveloper"
  access_until date,                            -- null = no end date
  active boolean NOT NULL DEFAULT true,
  auto_kinds text[] NOT NULL DEFAULT '{}',      -- request kinds that go to this person automatically
  client_ids uuid[],                            -- null = all clients; otherwise only these
  invited_by uuid,
  invited_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Team staff all" ON public.team_members;
CREATE POLICY "Team staff all" ON public.team_members FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "Team member own row" ON public.team_members;
CREATE POLICY "Team member own row" ON public.team_members FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Who does it
ALTER TABLE public.client_tasks ADD COLUMN IF NOT EXISTS assignee_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.client_requests ADD COLUMN IF NOT EXISTS assignee_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.client_requests ADD COLUMN IF NOT EXISTS review_ready_at timestamptz;
CREATE INDEX IF NOT EXISTS client_tasks_assignee_user_idx ON public.client_tasks(assignee_user_id) WHERE done_at IS NULL;
CREATE INDEX IF NOT EXISTS client_requests_assignee_user_idx ON public.client_requests(assignee_user_id);

-- Where a client's files live
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS drive_url text;
