-- Backups cover every client site (database + code). The runner sends the monitored site's id
-- with each run; a successful run stamps that site's last_backup_at.
CREATE OR REPLACE FUNCTION public.backup_report(_token text, _run jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id bigint; _site uuid;
BEGIN
  IF NOT public.backup_token_ok(_token) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.backup_runs(target, ok, tables, rows, bytes, sha256, file, error, manifest)
  VALUES (left(_run->>'target', 40), coalesce((_run->>'ok')::boolean, false), (_run->>'tables')::int,
          (_run->>'rows')::int, (_run->>'bytes')::bigint, left(_run->>'sha256', 64), left(_run->>'file', 200),
          left(_run->>'error', 2000), _run->'manifest')
  RETURNING id INTO _id;
  _site := CASE WHEN coalesce(_run->>'site_id', '') ~ '^[0-9a-f-]{36}$' THEN (_run->>'site_id')::uuid END;
  IF _site IS NOT NULL AND coalesce((_run->>'ok')::boolean, false) THEN
    UPDATE public.monitored_sites SET last_backup_at = now() WHERE id = _site;
  END IF;
  DELETE FROM public.backup_runs WHERE at < now() - interval '400 days';
  RETURN _id;
END $$;
