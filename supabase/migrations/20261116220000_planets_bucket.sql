-- Public bucket with the planet artwork for the Brain page (decorative images only, written by the server).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('planets', 'planets', true, 8388608, array['image/png'])
on conflict (id) do nothing;
