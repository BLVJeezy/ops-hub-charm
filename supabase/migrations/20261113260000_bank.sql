-- Bookkeeping phase C (manual): Revolut Business transactions (imported from statements/CSV), categorisation rules,
-- matching incoming payments to invoices, and posting every bank line to the ledger. Admin only. Re-runnable.

-- extra accounts used by the bank postings
INSERT INTO public.ledger_accounts (code, name, type, system_key) VALUES
  ('1010', 'Bank vreemde valuta (GBP/USD)', 'asset', 'bank_fx'),
  ('1900', 'Te verwerken bankverrichtingen', 'asset', 'suspense'),
  ('2500', 'Rekening-courant zaakvoerder', 'liability', 'owner'),
  ('6300', 'Auto, transport & reizen', 'expense', NULL),
  ('6400', 'Opleidingen & coaching', 'expense', NULL),
  ('6500', 'Inkoop goederen', 'expense', NULL),
  ('6600', 'Freelancers & onderaanneming', 'expense', NULL)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.journal_entries DROP CONSTRAINT IF EXISTS journal_entries_source_check;
ALTER TABLE public.journal_entries ADD CONSTRAINT journal_entries_source_check CHECK (source IN ('manual', 'invoice', 'payment', 'expense', 'bank'));

CREATE TABLE IF NOT EXISTS public.bank_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern text NOT NULL,                 -- ILIKE pattern on "type description", e.g. '%lovable%'
  direction text CHECK (direction IN ('in', 'out')),
  account_id uuid NOT NULL REFERENCES public.ledger_accounts(id) ON DELETE CASCADE,
  priority int NOT NULL DEFAULT 100,     -- lower wins
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pattern, direction)
);

CREATE TABLE IF NOT EXISTS public.bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank text NOT NULL DEFAULT 'revolut',
  account text NOT NULL DEFAULT 'EUR',
  hash text NOT NULL UNIQUE,             -- de-duplication key of the import
  date date NOT NULL,
  type text,                             -- CAR card · MOA money added · MOR received · MOS sent · FEE · EXI/EXO exchange
  description text NOT NULL,
  amount numeric(14, 2) NOT NULL,        -- signed, in the account currency (− = out)
  currency text NOT NULL DEFAULT 'EUR',
  orig_amount numeric(14, 2), orig_currency text, fx_rate numeric, fee numeric(14, 2) DEFAULT 0,
  status text NOT NULL DEFAULT 'Completed',
  category_account_id uuid REFERENCES public.ledger_accounts(id) ON DELETE SET NULL,
  categorised_by text,                   -- rule | manual | invoice
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  reviewed boolean NOT NULL DEFAULT false,
  note text,
  source text NOT NULL DEFAULT 'import',
  imported_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bank_transactions_date ON public.bank_transactions(date);

ALTER TABLE public.bank_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['bank_rules', 'bank_transactions'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Bank admin" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Bank admin" ON public.%I FOR ALL TO authenticated USING (public.has_role(auth.uid(), ''admin''::app_role)) WITH CHECK (public.has_role(auth.uid(), ''admin''::app_role))', t);
  END LOOP;
END $$;

-- starting rules (edit in the app; anything unmatched goes to 1900 "te verwerken" for review)
INSERT INTO public.bank_rules (pattern, direction, account_id, priority)
SELECT p, d, (SELECT id FROM ledger_accounts WHERE code = c), pr FROM (VALUES
  ('FEE %', 'out', '6100', 10),
  ('EXI %', NULL, '1010', 10), ('EXO %', NULL, '1010', 10),
  ('MOS To Jason Balongo%', 'out', '2500', 20), ('MOR From Jason B%', 'in', '2500', 20),
  ('CAR Facebk%', 'out', '6200', 50),
  ('CAR Shell%', 'out', '6300', 50), ('CAR Q8%', 'out', '6300', 50), ('CAR Esso%', 'out', '6300', 50), ('CAR Q Park%', 'out', '6300', 50), ('CAR Ryanair%', 'out', '6300', 50),
  ('CAR Lovable%', NULL, '6000', 60), ('CAR Anthropic%', NULL, '6000', 60), ('CAR Openai%', NULL, '6000', 60), ('CAR Base44%', NULL, '6000', 60),
  ('CAR Cookieyes%', NULL, '6000', 60), ('CAR Canva%', NULL, '6000', 60), ('CAR Resend%', NULL, '6000', 60), ('CAR Calendly%', NULL, '6000', 60),
  ('CAR Ionos%', NULL, '6000', 60), ('CAR Zoho%', NULL, '6000', 60), ('CAR Higgsfield%', NULL, '6000', 60), ('CAR Gamma%', NULL, '6000', 60),
  ('CAR Supabase%', NULL, '6000', 60), ('CAR Github%', NULL, '6000', 60), ('CAR Zoom%', NULL, '6000', 60), ('CAR Instantly%', NULL, '6000', 60),
  ('CAR Zadarma%', NULL, '6000', 60), ('CAR Shopify%', NULL, '6000', 60), ('CAR Google%', NULL, '6000', 60), ('CAR Leadsnap%', NULL, '6000', 60),
  ('CAR Myclaw%', NULL, '6000', 60), ('CAR Wetracked%', NULL, '6000', 60), ('CAR Flowagent%', NULL, '6000', 60), ('CAR P.skool%', NULL, '6400', 60),
  ('MOR Refund from Calendly%', 'in', '6000', 60)
) v(p, d, c, pr)
ON CONFLICT (pattern, direction) DO NOTHING;

-- Categorise, match to invoices, post to the ledger. Called by ledger_sync().
CREATE OR REPLACE FUNCTION public.bank_sync()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t record; r record; inv record; e uuid; acc uuid; posted int := 0; ruled int := 0; matched int := 0;
  a_bank uuid; a_deb uuid; a_sus uuid; cur_acc uuid; locked boolean;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'Alleen admins'; END IF;
  SELECT id INTO a_bank FROM ledger_accounts WHERE system_key = 'bank';
  SELECT id INTO a_deb FROM ledger_accounts WHERE system_key = 'debtors';
  SELECT id INTO a_sus FROM ledger_accounts WHERE system_key = 'suspense';

  -- 1. incoming money → open invoice of the same amount (client name in the description, paid on/after the invoice date)
  FOR t IN SELECT * FROM bank_transactions WHERE amount > 0 AND invoice_id IS NULL AND NOT reviewed AND coalesce(type, '') IN ('MOA', 'MOR', '') LOOP
    SELECT i.* INTO inv FROM invoices i
      WHERE i.status IN ('Sent', 'Paid') AND round(i.total::numeric, 2) = t.amount AND t.date >= i.date - 90
        AND NOT EXISTS (SELECT 1 FROM bank_transactions b WHERE b.invoice_id = i.id)
        AND (i.client_name IS NULL OR t.description ILIKE '%' || split_part(regexp_replace(i.client_name, '[^[:alnum:] ]', '', 'g'), ' ', 1) || '%')
      ORDER BY (i.status = 'Sent') DESC, abs(t.date - i.date) LIMIT 1;
    IF FOUND THEN
      UPDATE bank_transactions SET invoice_id = inv.id, category_account_id = a_deb, categorised_by = 'invoice' WHERE id = t.id;
      IF inv.status = 'Sent' THEN UPDATE invoices SET status = 'Paid' WHERE id = inv.id; END IF;
      matched := matched + 1;
    END IF;
  END LOOP;

  -- 2. rules for everything not categorised by hand or by an invoice
  FOR t IN SELECT * FROM bank_transactions WHERE coalesce(categorised_by, 'rule') = 'rule' AND invoice_id IS NULL AND NOT reviewed LOOP
    SELECT br.account_id INTO acc FROM bank_rules br
      WHERE (coalesce(t.type, '') || ' ' || t.description) ILIKE br.pattern
        AND (br.direction IS NULL OR (br.direction = 'in') = (t.amount > 0))
      ORDER BY br.priority, length(br.pattern) DESC LIMIT 1;
    IF acc IS DISTINCT FROM t.category_account_id THEN
      UPDATE bank_transactions SET category_account_id = acc, categorised_by = CASE WHEN acc IS NULL THEN NULL ELSE 'rule' END WHERE id = t.id;
      ruled := ruled + 1;
    END IF;
  END LOOP;

  -- 3. one ledger entry per bank line: bank ↔ category (or invoice → debtors, or 1900 to review)
  FOR t IN SELECT * FROM bank_transactions WHERE status = 'Completed' AND amount <> 0 LOOP
    acc := coalesce(t.category_account_id, a_sus);
    SELECT j.id, (SELECT l.account_id FROM journal_lines l WHERE l.entry_id = j.id AND l.account_id <> a_bank LIMIT 1)
      INTO e, cur_acc FROM journal_entries j WHERE j.source = 'bank' AND j.source_id = t.id::text;
    IF e IS NOT NULL AND cur_acc = acc THEN CONTINUE; END IF;
    locked := EXISTS (SELECT 1 FROM ledger_periods WHERE month = date_trunc('month', t.date)::date AND locked_at IS NOT NULL);
    IF locked THEN CONTINUE; END IF;
    IF e IS NOT NULL THEN DELETE FROM journal_entries WHERE id = e; END IF;
    INSERT INTO journal_entries(date, description, source, source_id)
      VALUES (t.date, left(coalesce(t.type || ' ', '') || t.description, 200), 'bank', t.id::text) RETURNING id INTO e;
    IF t.amount > 0 THEN
      INSERT INTO journal_lines(entry_id, account_id, debit) VALUES (e, a_bank, t.amount);
      INSERT INTO journal_lines(entry_id, account_id, credit) VALUES (e, acc, t.amount);
    ELSE
      INSERT INTO journal_lines(entry_id, account_id, debit) VALUES (e, acc, -t.amount);
      INSERT INTO journal_lines(entry_id, account_id, credit) VALUES (e, a_bank, -t.amount);
    END IF;
    posted := posted + 1;
  END LOOP;
  -- bank lines that were deleted
  DELETE FROM journal_entries j WHERE j.source = 'bank' AND NOT EXISTS (SELECT 1 FROM bank_transactions b WHERE b.id::text = j.source_id)
    AND NOT EXISTS (SELECT 1 FROM ledger_periods p WHERE p.month = date_trunc('month', j.date)::date AND p.locked_at IS NOT NULL);

  RETURN jsonb_build_object('matched', matched, 'categorised', ruled, 'posted', posted,
    'to_review', (SELECT count(*) FROM bank_transactions WHERE category_account_id IS NULL AND NOT reviewed));
END $$;
REVOKE ALL ON FUNCTION public.bank_sync() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bank_sync() TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ledger_sync now runs bank_sync first and lets the bank replace guessed payments and expenses in the period it covers
CREATE OR REPLACE FUNCTION public.ledger_sync()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  inv record; ex record; m date; e uuid; made int := 0; updated int := 0; removed int := 0; skipped int := 0;
  a_bank uuid; a_deb uuid; a_rev uuid; a_exp uuid; cur numeric; locked boolean;
  bank jsonb; b_from date; b_to date;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'Alleen admins'; END IF;
  SELECT id INTO a_bank FROM ledger_accounts WHERE system_key = 'bank';
  SELECT id INTO a_deb FROM ledger_accounts WHERE system_key = 'debtors';
  SELECT id INTO a_rev FROM ledger_accounts WHERE system_key = 'revenue';
  -- bank statements first: they match payments to invoices and are the truth for the period they cover
  bank := public.bank_sync();
  SELECT min(date), max(date) INTO b_from, b_to FROM bank_transactions;

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
  -- (not for invoices paid via the bank, nor dated inside the period the bank statements cover)
  FOR inv IN SELECT * FROM invoices WHERE status = 'Paid' AND coalesce(total, 0) > 0
             AND NOT EXISTS (SELECT 1 FROM bank_transactions b WHERE b.invoice_id = invoices.id)
             AND (b_from IS NULL OR invoices.date < b_from)
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
             AND (NOT EXISTS (SELECT 1 FROM invoices i WHERE i.id::text = j.source_id AND (i.status = 'Paid' OR (j.source = 'invoice' AND i.status = 'Sent')))
                  OR (j.source = 'payment' AND (EXISTS (SELECT 1 FROM bank_transactions b WHERE b.invoice_id::text = j.source_id)
                       OR EXISTS (SELECT 1 FROM invoices i WHERE i.id::text = j.source_id AND b_from IS NOT NULL AND i.date >= b_from))))
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
      IF b_from IS NOT NULL AND m BETWEEN date_trunc('month', b_from)::date AND date_trunc('month', b_to)::date THEN CONTINUE; END IF;   -- the bank has the real payments
      IF EXISTS (SELECT 1 FROM journal_entries j WHERE j.source = 'expense' AND j.source_id = ex.id::text || ':' || to_char(m, 'YYYY-MM')) THEN CONTINUE; END IF;
      IF EXISTS (SELECT 1 FROM ledger_periods WHERE month = m AND locked_at IS NOT NULL) THEN skipped := skipped + 1; CONTINUE; END IF;
      INSERT INTO journal_entries(date, description, source, source_id)
        VALUES (greatest(m, ex.created_at::date), ex.name || ' · ' || to_char(m, 'MM/YYYY'), 'expense', ex.id::text || ':' || to_char(m, 'YYYY-MM')) RETURNING id INTO e;
      INSERT INTO journal_lines(entry_id, account_id, debit, client_id) VALUES (e, a_exp, ex.monthly_cost, ex.linked_client);
      INSERT INTO journal_lines(entry_id, account_id, credit) VALUES (e, a_bank, ex.monthly_cost);
      made := made + 1;
    END LOOP;
  END LOOP;

  -- expense postings for months the bank statements cover are replaced by the real bank lines
  FOR e IN SELECT j.id FROM journal_entries j WHERE j.source = 'expense' AND b_from IS NOT NULL
             AND date_trunc('month', j.date)::date BETWEEN date_trunc('month', b_from)::date AND date_trunc('month', b_to)::date
             AND NOT EXISTS (SELECT 1 FROM ledger_periods p WHERE p.month = date_trunc('month', j.date)::date AND p.locked_at IS NOT NULL) LOOP
    DELETE FROM journal_entries WHERE id = e; removed := removed + 1;
  END LOOP;

  RETURN jsonb_build_object('bank', bank, 'created', made, 'updated', updated, 'removed', removed, 'skipped_locked', skipped, 'at', now());
END $$;
REVOKE ALL ON FUNCTION public.ledger_sync() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ledger_sync() TO authenticated;
NOTIFY pgrst, 'reload schema';

-- more rules found in the first statement (Dec 2025 – Nov 2026)
INSERT INTO public.bank_rules (pattern, direction, account_id, priority)
SELECT p, d, (SELECT id FROM ledger_accounts WHERE code = c), pr FROM (VALUES
  ('CAR %Higgsfield%', NULL, '6000', 55), ('CAR X Developer%', NULL, '6000', 60), ('CAR Dnh*godaddy%', NULL, '6000', 60),
  ('CAR Bls*www.artlist%', NULL, '6000', 60), ('CAR Shell Belgium Ev%', 'out', '6300', 50), ('CAR Gabriels%Tokheim%', 'out', '6300', 50),
  ('MOS To Hong Kong Meixiang%', 'out', '6500', 40), ('MOS To Guangzhou Haoqianyi%', 'out', '6500', 40),
  ('MOS To Muhammad Masae%', 'out', '6600', 40), ('MOA Money added from BALONGO-LISSONDJA%', 'in', '2500', 30)
) v(p, d, c, pr)
ON CONFLICT (pattern, direction) DO NOTHING;
