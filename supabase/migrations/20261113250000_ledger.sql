-- Bookkeeping, phase A: chart of accounts, double-entry journal, locked periods, audit log,
-- automatic postings from invoices (sent → revenue, paid → bank) and monthly expenses.
-- Admin only. Re-runnable. Not a filing tool: the accountant / filing software stays responsible.

CREATE TABLE IF NOT EXISTS public.ledger_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('asset', 'liability', 'equity', 'income', 'expense')),
  system_key text UNIQUE,              -- used by the automatic postings
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  description text NOT NULL,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'invoice', 'payment', 'expense')),
  source_id text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, source_id)
);
CREATE INDEX IF NOT EXISTS journal_entries_date ON public.journal_entries(date);

CREATE TABLE IF NOT EXISTS public.journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.ledger_accounts(id),
  debit numeric(14, 2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit numeric(14, 2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  vat_code text,
  memo text,
  CHECK (debit = 0 OR credit = 0)
);
CREATE INDEX IF NOT EXISTS journal_lines_entry ON public.journal_lines(entry_id);
CREATE INDEX IF NOT EXISTS journal_lines_account ON public.journal_lines(account_id);

CREATE TABLE IF NOT EXISTS public.ledger_periods (
  month date PRIMARY KEY CHECK (extract(day FROM month) = 1),
  locked_at timestamptz,
  locked_by uuid
);

CREATE TABLE IF NOT EXISTS public.ledger_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  action text NOT NULL,
  entry_id uuid,
  detail jsonb
);

-- ---------- rules ----------
-- 1. Every entry balances (checked at commit, so lines can be inserted one by one inside a transaction).
CREATE OR REPLACE FUNCTION public.ledger_check_balance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE e uuid := coalesce(NEW.entry_id, OLD.entry_id); d numeric; c numeric;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM journal_entries WHERE id = e) THEN RETURN NULL; END IF;
  SELECT coalesce(sum(debit), 0), coalesce(sum(credit), 0) INTO d, c FROM journal_lines WHERE entry_id = e;
  IF d <> c THEN RAISE EXCEPTION 'Boeking is niet in evenwicht (debet % ≠ credit %)', d, c; END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS journal_lines_balance ON public.journal_lines;
CREATE CONSTRAINT TRIGGER journal_lines_balance AFTER INSERT OR UPDATE OR DELETE ON public.journal_lines
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.ledger_check_balance();

-- 2. A locked month cannot change (corrections go through a new entry in an open month).
CREATE OR REPLACE FUNCTION public.ledger_check_lock() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d date;
BEGIN
  IF TG_TABLE_NAME = 'journal_entries' THEN
    FOR d IN SELECT x FROM unnest(ARRAY[CASE WHEN TG_OP <> 'INSERT' THEN OLD.date END, CASE WHEN TG_OP <> 'DELETE' THEN NEW.date END]) x WHERE x IS NOT NULL LOOP
      IF EXISTS (SELECT 1 FROM ledger_periods WHERE month = date_trunc('month', d)::date AND locked_at IS NOT NULL) THEN
        RAISE EXCEPTION 'Periode % is afgesloten', to_char(d, 'MM/YYYY');
      END IF;
    END LOOP;
  ELSE
    SELECT date INTO d FROM journal_entries WHERE id = coalesce(NEW.entry_id, OLD.entry_id);
    IF d IS NOT NULL AND EXISTS (SELECT 1 FROM ledger_periods WHERE month = date_trunc('month', d)::date AND locked_at IS NOT NULL) THEN
      RAISE EXCEPTION 'Periode % is afgesloten', to_char(d, 'MM/YYYY');
    END IF;
  END IF;
  RETURN coalesce(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS journal_entries_lock ON public.journal_entries;
CREATE TRIGGER journal_entries_lock BEFORE INSERT OR UPDATE OR DELETE ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.ledger_check_lock();
DROP TRIGGER IF EXISTS journal_lines_lock ON public.journal_lines;
CREATE TRIGGER journal_lines_lock BEFORE INSERT OR UPDATE OR DELETE ON public.journal_lines FOR EACH ROW EXECUTE FUNCTION public.ledger_check_lock();

-- 3. Audit log of every entry change.
CREATE OR REPLACE FUNCTION public.ledger_log() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO ledger_audit(user_id, action, entry_id, detail)
  VALUES (auth.uid(), lower(TG_OP), coalesce(NEW.id, OLD.id), to_jsonb(coalesce(NEW, OLD)));
  RETURN coalesce(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS journal_entries_audit ON public.journal_entries;
CREATE TRIGGER journal_entries_audit AFTER INSERT OR UPDATE OR DELETE ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.ledger_log();

-- ---------- access: admins only ----------
ALTER TABLE public.ledger_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_audit ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['ledger_accounts', 'journal_entries', 'journal_lines', 'ledger_periods'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Ledger admin" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Ledger admin" ON public.%I FOR ALL TO authenticated USING (public.has_role(auth.uid(), ''admin''::app_role)) WITH CHECK (public.has_role(auth.uid(), ''admin''::app_role))', t);
  END LOOP;
END $$;
DROP POLICY IF EXISTS "Ledger audit read" ON public.ledger_audit;
CREATE POLICY "Ledger audit read" ON public.ledger_audit FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- ---------- chart of accounts (editable; replace with the accountant's scheme) ----------
INSERT INTO public.ledger_accounts (code, name, type, system_key) VALUES
  ('1000', 'Bank (Revolut Business)', 'asset', 'bank'),
  ('1100', 'Debiteuren (klanten)', 'asset', 'debtors'),
  ('1200', 'Btw te vorderen', 'asset', 'vat_receivable'),
  ('2000', 'Crediteuren (leveranciers)', 'liability', 'creditors'),
  ('2100', 'Btw te betalen', 'liability', 'vat_payable'),
  ('3000', 'Eigen vermogen', 'equity', 'equity'),
  ('8000', 'Omzet diensten (websites, SEO, onderhoud)', 'income', 'revenue'),
  ('8100', 'Overige opbrengsten', 'income', NULL),
  ('6000', 'Software & tools', 'expense', 'exp_tool'),
  ('6010', 'Vermeldingen & citaties', 'expense', 'exp_directory'),
  ('6020', 'Abonnementen', 'expense', 'exp_subscription'),
  ('6090', 'Overige kosten', 'expense', 'exp_other'),
  ('6100', 'Bankkosten', 'expense', NULL),
  ('6200', 'Marketing & advertenties', 'expense', NULL)
ON CONFLICT (code) DO NOTHING;

-- ---------- manual posting (atomic) ----------
CREATE OR REPLACE FUNCTION public.ledger_post(_date date, _description text, _lines jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE e uuid; l jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'Alleen admins kunnen boeken'; END IF;
  IF jsonb_array_length(_lines) < 2 THEN RAISE EXCEPTION 'Minstens twee regels'; END IF;
  INSERT INTO journal_entries(date, description, source, created_by) VALUES (_date, _description, 'manual', auth.uid()) RETURNING id INTO e;
  FOR l IN SELECT * FROM jsonb_array_elements(_lines) LOOP
    INSERT INTO journal_lines(entry_id, account_id, debit, credit, client_id, vat_code, memo)
    VALUES (e, (l->>'account_id')::uuid, coalesce((l->>'debit')::numeric, 0), coalesce((l->>'credit')::numeric, 0),
            nullif(l->>'client_id', '')::uuid, nullif(l->>'vat_code', ''), nullif(l->>'memo', ''));
  END LOOP;
  RETURN e;
END $$;

-- ---------- automatic postings ----------
CREATE OR REPLACE FUNCTION public.ledger_sync()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  inv record; ex record; m date; e uuid; made int := 0; updated int := 0; removed int := 0; skipped int := 0;
  a_bank uuid; a_deb uuid; a_rev uuid; a_exp uuid; cur numeric; locked boolean;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'Alleen admins'; END IF;
  SELECT id INTO a_bank FROM ledger_accounts WHERE system_key = 'bank';
  SELECT id INTO a_deb FROM ledger_accounts WHERE system_key = 'debtors';
  SELECT id INTO a_rev FROM ledger_accounts WHERE system_key = 'revenue';

  -- invoices: sent (or paid) → Dr debtors / Cr revenue on the invoice date (0 % btw, verlegd)
  FOR inv IN SELECT * FROM invoices WHERE status IN ('Sent', 'Paid') AND coalesce(total, 0) > 0 LOOP
    locked := EXISTS (SELECT 1 FROM ledger_periods WHERE month = date_trunc('month', inv.date)::date AND locked_at IS NOT NULL);
    SELECT id INTO e FROM journal_entries WHERE source = 'invoice' AND source_id = inv.id::text;
    IF e IS NOT NULL THEN
      SELECT sum(debit) INTO cur FROM journal_lines WHERE entry_id = e;
      IF cur = inv.total THEN CONTINUE; END IF;
      IF locked THEN skipped := skipped + 1; CONTINUE; END IF;
      DELETE FROM journal_entries WHERE id = e; updated := updated + 1;
    ELSIF locked THEN skipped := skipped + 1; CONTINUE;
    ELSE made := made + 1; END IF;
    INSERT INTO journal_entries(date, description, source, source_id)
      VALUES (inv.date, 'Factuur ' || coalesce(inv.invoice_number::text, '') || ' · ' || coalesce(inv.client_name, ''), 'invoice', inv.id::text) RETURNING id INTO e;
    INSERT INTO journal_lines(entry_id, account_id, debit, client_id) VALUES (e, a_deb, inv.total, inv.client);
    INSERT INTO journal_lines(entry_id, account_id, credit, client_id, vat_code) VALUES (e, a_rev, inv.total, inv.client, 'VERLEGD');
  END LOOP;

  -- paid invoices → Dr bank / Cr debtors (dated the first time it is seen as paid; never moved afterwards)
  FOR inv IN SELECT * FROM invoices WHERE status = 'Paid' AND coalesce(total, 0) > 0
             AND NOT EXISTS (SELECT 1 FROM journal_entries j WHERE j.source = 'payment' AND j.source_id = invoices.id::text) LOOP
    m := least(current_date, greatest(inv.date, coalesce(inv.updated_at::date, inv.date)));
    IF EXISTS (SELECT 1 FROM ledger_periods WHERE month = date_trunc('month', m)::date AND locked_at IS NOT NULL) THEN m := current_date; END IF;
    INSERT INTO journal_entries(date, description, source, source_id)
      VALUES (m, 'Betaling factuur ' || coalesce(inv.invoice_number::text, '') || ' · ' || coalesce(inv.client_name, ''), 'payment', inv.id::text) RETURNING id INTO e;
    INSERT INTO journal_lines(entry_id, account_id, debit, client_id) VALUES (e, a_bank, inv.total, inv.client);
    INSERT INTO journal_lines(entry_id, account_id, credit, client_id) VALUES (e, a_deb, inv.total, inv.client);
    made := made + 1;
  END LOOP;

  -- invoices back to draft / deleted → remove their open-period postings
  FOR e IN SELECT j.id FROM journal_entries j
           WHERE j.source IN ('invoice', 'payment')
             AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.id::text = j.source_id AND (i.status = 'Paid' OR (j.source = 'invoice' AND i.status = 'Sent')))
             AND NOT EXISTS (SELECT 1 FROM ledger_periods p WHERE p.month = date_trunc('month', j.date)::date AND p.locked_at IS NOT NULL) LOOP
    DELETE FROM journal_entries WHERE id = e; removed := removed + 1;
  END LOOP;

  -- monthly expenses → one posting per month since the expense was added (Dr cost / Cr bank).
  -- Months already posted are never changed; an expense of an inactive client stops being posted.
  FOR ex IN SELECT x.*, c.status AS client_status FROM expenses x LEFT JOIN clients c ON c.id = x.linked_client WHERE coalesce(x.monthly_cost, 0) > 0 LOOP
    IF ex.linked_client IS NOT NULL AND coalesce(ex.client_status::text, '') <> 'Active' THEN CONTINUE; END IF;
    SELECT id INTO a_exp FROM ledger_accounts WHERE system_key = CASE ex.category::text
      WHEN 'Tool' THEN 'exp_tool' WHEN 'Directory/Citations' THEN 'exp_directory' WHEN 'Subscription' THEN 'exp_subscription' ELSE 'exp_other' END;
    FOR m IN SELECT generate_series(date_trunc('month', ex.created_at)::date, date_trunc('month', current_date)::date, interval '1 month')::date LOOP
      IF EXISTS (SELECT 1 FROM journal_entries j WHERE j.source = 'expense' AND j.source_id = ex.id::text || ':' || to_char(m, 'YYYY-MM')) THEN CONTINUE; END IF;
      IF EXISTS (SELECT 1 FROM ledger_periods WHERE month = m AND locked_at IS NOT NULL) THEN skipped := skipped + 1; CONTINUE; END IF;
      INSERT INTO journal_entries(date, description, source, source_id)
        VALUES (greatest(m, ex.created_at::date), ex.name || ' · ' || to_char(m, 'MM/YYYY'), 'expense', ex.id::text || ':' || to_char(m, 'YYYY-MM')) RETURNING id INTO e;
      INSERT INTO journal_lines(entry_id, account_id, debit, client_id) VALUES (e, a_exp, ex.monthly_cost, ex.linked_client);
      INSERT INTO journal_lines(entry_id, account_id, credit) VALUES (e, a_bank, ex.monthly_cost);
      made := made + 1;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('created', made, 'updated', updated, 'removed', removed, 'skipped_locked', skipped, 'at', now());
END $$;
REVOKE ALL ON FUNCTION public.ledger_sync() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ledger_sync() TO authenticated;

-- nightly sync at 02:15 UTC
DO $$ BEGIN
  PERFORM cron.unschedule('ledger-sync') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ledger-sync');
END $$;
SELECT cron.schedule('ledger-sync', '15 2 * * *', 'SELECT public.ledger_sync()');

NOTIFY pgrst, 'reload schema';
