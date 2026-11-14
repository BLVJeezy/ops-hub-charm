-- Paged, token-protected export used by the nightly off-site backup (repo solyn-backups).
-- Install in each Lovable Cloud database; replace __HASH__ with sha256(token) and
-- __TARGET__ with the target name. Only the hash lives in the database.
--   backup_export(token)                       -> {target, exported_at, tables:{name:count}}
--   backup_export(token, 'table', offset, lim) -> json array of rows
-- Columns that hold credentials are stripped, never exported.

DROP FUNCTION IF EXISTS public.backup_export(text);

CREATE OR REPLACE FUNCTION public.backup_token_ok(_token text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(sha256(convert_to(coalesce(_token, ''), 'UTF8')), 'hex') = '__HASH__'
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
    RETURN jsonb_build_object('target', '__TARGET__', 'exported_at', now(), 'format', 2, 'tables', counts);
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
    AND column_name ~* '^(token|apikey|api_key|secret|password|access_token|refresh_token|ical_url)$';

  EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(x) - $1), ''[]'') FROM
                    (SELECT * FROM public.%I ORDER BY ctid OFFSET $2 LIMIT $3) x', _table)
    INTO res USING strip, _offset, least(_limit, 10000);
  RETURN res;
END $$;

REVOKE ALL ON FUNCTION public.backup_export(text, text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.backup_export(text, text, int, int) TO anon, authenticated;
