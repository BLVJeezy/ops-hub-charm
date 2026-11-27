-- Credit notes in the ledger: sent credit note → Dr revenue (btw verlegd) / Cr debtors on its date. Patches ledger_sync() in place. Re-runnable.
ALTER TABLE public.journal_entries DROP CONSTRAINT IF EXISTS journal_entries_source_check;
ALTER TABLE public.journal_entries ADD CONSTRAINT journal_entries_source_check CHECK (source IN ('manual', 'invoice', 'payment', 'expense', 'bank', 'credit_note'));
DO $do$ DECLARE d text; BEGIN
  d := pg_get_functiondef('public.ledger_sync()'::regprocedure);
  IF position('credit_note' in d) = 0 THEN
    d := replace(d, '  RETURN jsonb_build_object(''bank''', $blk$
  -- credit notes (sent) → Dr revenue (btw verlegd) / Cr debtors on the credit-note date; the refund itself comes in via the bank (Dr debtors / Cr bank)
  FOR inv IN SELECT * FROM credit_notes WHERE status <> 'Draft' AND coalesce(amount, 0) > 0 LOOP
    locked := EXISTS (SELECT 1 FROM ledger_periods WHERE month = date_trunc('month', inv.date)::date AND locked_at IS NOT NULL);
    SELECT id INTO e FROM journal_entries WHERE source = 'credit_note' AND source_id = inv.id::text;
    IF e IS NOT NULL THEN
      SELECT sum(debit) INTO cur FROM journal_lines WHERE entry_id = e;
      IF cur = inv.amount THEN CONTINUE; END IF;
      IF locked THEN skipped := skipped + 1; CONTINUE; END IF;
      DELETE FROM journal_entries WHERE id = e; updated := updated + 1;
    ELSIF locked THEN skipped := skipped + 1; CONTINUE;
    ELSE made := made + 1; END IF;
    INSERT INTO journal_entries(date, description, source, source_id)
      VALUES (inv.date, 'Creditnota ' || coalesce(inv.credit_number, '') || ' · ' || coalesce(inv.client_name, ''), 'credit_note', inv.id::text) RETURNING id INTO e;
    INSERT INTO journal_lines(entry_id, account_id, debit, client_id, vat_code) VALUES (e, a_rev, inv.amount, inv.client, 'VERLEGD');
    INSERT INTO journal_lines(entry_id, account_id, credit, client_id) VALUES (e, a_deb, inv.amount, inv.client);
  END LOOP;
  FOR e IN SELECT j.id FROM journal_entries j WHERE j.source = 'credit_note'
             AND NOT EXISTS (SELECT 1 FROM credit_notes c WHERE c.id::text = j.source_id AND c.status <> 'Draft')
             AND NOT EXISTS (SELECT 1 FROM ledger_periods p WHERE p.month = date_trunc('month', j.date)::date AND p.locked_at IS NOT NULL) LOOP
    DELETE FROM journal_entries WHERE id = e; removed := removed + 1;
  END LOOP;

$blk$ || '  RETURN jsonb_build_object(''bank''');
    EXECUTE d;
  END IF;
END $do$;
NOTIFY pgrst, 'reload schema';
