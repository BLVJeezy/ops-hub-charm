-- Promote the first-registered user to admin (idempotent).
-- Fixes: default role is 'ops', which hides the Onboarding Queue,
-- blocks editing prospects, and removes all delete permissions.
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' FROM auth.users ORDER BY created_at ASC LIMIT 1
ON CONFLICT DO NOTHING;
