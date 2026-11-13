-- Off-site backups: a token-protected export of every public table, plus a log of runs.
-- The nightly GitHub Action (repo solyn-backups) calls backup_export, encrypts the result
-- with age and reports back via backup_report. Only the sha256 of the token is stored here.

CREATE TABLE IF NOT EXISTS public.backup_runs (
  id          bigserial PRIMARY KEY,
  at          timestamptz NOT NULL DEFAULT now(),
  target      text NOT NULL,            -- hub | riory | villa-amano
  ok          boolean NOT NULL,
  tables      int,
  rows        int,
  bytes       bigint,
  sha256      text,                     -- of the encrypted file
  file        text,                     -- path in solyn-backups
  error       text,
  manifest    jsonb
);
ALTER TABLE public.backup_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Backup runs admin read" ON public.backup_runs;
CREATE POLICY "Backup runs admin read" ON public.backup_runs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Paged export, same as backup/sql/export_function.sql with this database's token hash.
DROP FUNCTION IF EXISTS public.backup_export(text);

CREATE OR REPLACE FUNCTION public.backup_token_ok(_token text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(sha256(convert_to(coalesce(_token, ''), 'UTF8')), 'hex') = '07cc86d4b801acd9882c238a7bc712c243469ec8f557382b52893a702810a7b4'
$$;

CREATE OR REPLACE FUNCTION public.backup_export(_token text, _table text DEFAULT NULL,
                                               _offset int DEFAULT 0, _limit int DEFAULT 5000)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
SET statement_timeout = '60s' AS $$
DECLARE
  t record; n bigint; counts jsonb := '{}'::jsonb; strip text[]; res jsonb;
BEGIN
  IF NOT public.backup_token_ok(_token) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF _table IS NULL THEN
    FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
             WHERE ns.nspname = 'public' AND c.relkind = 'r' ORDER BY c.relname LOOP
      EXECUTE format('SELECT count(*) FROM public.%I', t.relname) INTO n;
      counts := counts || jsonb_build_object(t.relname, n);
    END LOOP;
    SELECT count(*) INTO n FROM auth.users;
    counts := counts || jsonb_build_object('auth_users', n);
    RETURN jsonb_build_object('target', 'hub', 'exported_at', now(), 'format', 2, 'tables', counts);
  END IF;

  IF _table = 'auth_users' THEN
    -- accounts without password hashes, so roles and owner links can be restored
    SELECT coalesce(jsonb_agg(r), '[]') INTO res FROM (
      SELECT jsonb_build_object('id', u.id, 'email', u.email, 'created_at', u.created_at,
                                'meta', u.raw_user_meta_data) r
      FROM auth.users u ORDER BY u.created_at, u.id OFFSET _offset LIMIT least(_limit, 10000)) s;
    RETURN res;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
                 WHERE ns.nspname = 'public' AND c.relkind = 'r' AND c.relname = _table) THEN
    RAISE EXCEPTION 'unknown table %', _table;
  END IF;

  SELECT coalesce(array_agg(column_name::text), '{}') INTO strip FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = _table
    AND column_name ~* '^(token|apikey|api_key|secret|password|access_token|refresh_token)$';

  EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(x) - $1), ''[]'') FROM
                    (SELECT * FROM public.%I ORDER BY ctid OFFSET $2 LIMIT $3) x', _table)
    INTO res USING strip, _offset, least(_limit, 10000);
  RETURN res;
END $$;


CREATE OR REPLACE FUNCTION public.backup_report(_token text, _run jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id bigint;
BEGIN
  IF NOT public.backup_token_ok(_token) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.backup_runs(target, ok, tables, rows, bytes, sha256, file, error, manifest)
  VALUES (left(_run->>'target', 40), coalesce((_run->>'ok')::boolean, false), (_run->>'tables')::int,
          (_run->>'rows')::int, (_run->>'bytes')::bigint, left(_run->>'sha256', 64), left(_run->>'file', 200),
          left(_run->>'error', 2000), _run->'manifest')
  RETURNING id INTO _id;
  -- show it on the client's Status card
  IF coalesce((_run->>'ok')::boolean, false) THEN
    UPDATE public.monitored_sites SET last_backup_at = now()
    WHERE id = CASE _run->>'target'
      WHEN 'riory' THEN 'e58b41b8-2c1c-40fb-a5ac-2782c11b10f9'::uuid
      WHEN 'villa-amano' THEN '0dfa523f-6dbe-4917-8f4c-80908e281823'::uuid END;
  END IF;
  DELETE FROM public.backup_runs WHERE at < now() - interval '400 days';
  RETURN _id;
END $$;

REVOKE ALL ON FUNCTION public.backup_export(text, text, int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.backup_report(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.backup_export(text, text, int, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backup_report(text, jsonb) TO anon, authenticated;

-- Latest run per target, for the noon briefing and the Status page.
CREATE OR REPLACE FUNCTION public.backup_status()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('target', r.target, 'ok', r.ok, 'at', r.at, 'rows', r.rows,
           'bytes', r.bytes, 'error', r.error, 'stale', r.at < now() - interval '36 hours') ORDER BY r.target), '[]')
  FROM (SELECT DISTINCT ON (target) * FROM public.backup_runs ORDER BY target, at DESC) r
$$;
REVOKE ALL ON FUNCTION public.backup_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.backup_status() TO authenticated, service_role;

-- Add the backup status to the noon briefing snapshot.
DO $do$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.briefing_snapshot()'::regprocedure);
  IF position('''backups''' in d) = 0 THEN
    d := replace(d, '''generated_at'', now(), ''day'', (SELECT today FROM d),',
                    '''generated_at'', now(), ''day'', (SELECT today FROM d), ''backups'', public.backup_status(),');
    EXECUTE d;
  END IF;
END $do$;
