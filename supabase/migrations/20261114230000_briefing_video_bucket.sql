-- Private bucket for the noon-scan films. Written only by the server (service role) through
-- /api/public/hooks/briefing-video; staff watch them through short-lived signed links. No public access, no RLS policies needed.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('briefings', 'briefings', false, 62914560, array['video/mp4'])
on conflict (id) do nothing;
