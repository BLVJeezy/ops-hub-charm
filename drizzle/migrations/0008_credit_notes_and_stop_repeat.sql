ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS repeat_stopped_at timestamptz,
  ADD COLUMN IF NOT EXISTS credited_amount numeric,
  ADD COLUMN IF NOT EXISTS credited_at timestamptz;

CREATE TABLE public.credit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_number text NOT NULL UNIQUE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  client uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  client_name text,
  client_address text,
  client_vat_number text,
  date date NOT NULL DEFAULT current_date,
  amount numeric NOT NULL,
  reason text NOT NULL,
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  vat_note text,
  status text NOT NULL DEFAULT 'Draft',
  sent_at timestamptz,
  resend_message_id text,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  CONSTRAINT credit_notes_status_check CHECK (status IN ('Draft', 'Sent')),
  CONSTRAINT credit_notes_amount_positive CHECK (amount > 0)
);

CREATE INDEX credit_notes_invoice_id_idx ON public.credit_notes (invoice_id);
CREATE INDEX credit_notes_client_idx ON public.credit_notes (client);
CREATE INDEX credit_notes_resend_message_id_idx ON public.credit_notes (resend_message_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_notes TO authenticated;
GRANT ALL ON public.credit_notes TO service_role;

ALTER TABLE public.credit_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Credit notes read staff"
  ON public.credit_notes
  FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Credit notes insert staff"
  ON public.credit_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "Credit notes update staff"
  ON public.credit_notes
  FOR UPDATE
  TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "Credit notes delete admin"
  ON public.credit_notes
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.assign_credit_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  yr integer;
  max_seq integer;
BEGIN
  IF NEW.credit_number IS NULL OR btrim(NEW.credit_number) = '' THEN
    yr := EXTRACT(YEAR FROM COALESCE(NEW.date, CURRENT_DATE))::integer;
    PERFORM pg_advisory_xact_lock(hashtext('credit_notes_' || yr::text));
    SELECT COALESCE(MAX((regexp_match(credit_number, '^CN-' || yr::text || '-([0-9]+)$'))[1]::integer), 0)
      INTO max_seq
      FROM public.credit_notes
      WHERE credit_number ~ ('^CN-' || yr::text || '-[0-9]+$');
    NEW.credit_number := 'CN-' || yr::text || '-' || lpad((max_seq + 1)::text, 3, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER credit_notes_assign_number
  BEFORE INSERT ON public.credit_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_credit_number();

CREATE OR REPLACE FUNCTION public.sync_invoice_credited_amount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_invoice_id uuid;
  total_credited numeric;
  latest_credit timestamptz;
BEGIN
  target_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  SELECT COALESCE(SUM(amount), 0), MAX(created_at)
    INTO total_credited, latest_credit
    FROM public.credit_notes
    WHERE invoice_id = target_invoice_id;

  UPDATE public.invoices
    SET credited_amount = CASE WHEN total_credited > 0 THEN total_credited ELSE NULL END,
        credited_at = CASE WHEN total_credited > 0 THEN latest_credit ELSE NULL END
    WHERE id = target_invoice_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER credit_notes_sync_invoice
  AFTER INSERT OR UPDATE OR DELETE ON public.credit_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_invoice_credited_amount();

-- Seed the two already-sent credit notes for invoices 53 and 54
INSERT INTO public.credit_notes (
  credit_number, invoice_id, client, client_name, client_address, client_vat_number,
  date, amount, reason, line_items, vat_note, status, sent_at
)
SELECT
  'CN-2026-001',
  i.id,
  i.client,
  i.client_name,
  i.client_address,
  i.client_vat_number,
  '2026-11-27'::date,
  150,
  'Volledige terugbetaling van de vooruitbetaling',
  i.line_items,
  i.vat_note,
  'Sent',
  now()
FROM public.invoices i
WHERE i.invoice_number = 53
ON CONFLICT (credit_number) DO NOTHING;

INSERT INTO public.credit_notes (
  credit_number, invoice_id, client, client_name, client_address, client_vat_number,
  date, amount, reason, line_items, vat_note, status, sent_at
)
SELECT
  'CN-2026-002',
  i.id,
  i.client,
  i.client_name,
  i.client_address,
  i.client_vat_number,
  '2026-11-27'::date,
  150,
  'Volledige terugbetaling van de vooruitbetaling',
  i.line_items,
  i.vat_note,
  'Sent',
  now()
FROM public.invoices i
WHERE i.invoice_number = 54
ON CONFLICT (credit_number) DO NOTHING;

-- Stop monthly repeats on invoices 53 and 54
UPDATE public.invoices
SET repeat_monthly = false,
    next_repeat_on = null,
    repeat_day = null,
    repeat_hour = null,
    repeat_stopped_at = now()
WHERE invoice_number IN (53, 54);

-- Also remove any unsent draft child invoices of 53 and 54 (defensive)
DELETE FROM public.invoices
WHERE repeat_parent IN (SELECT id FROM public.invoices WHERE invoice_number IN (53, 54))
  AND status = 'Draft'
  AND sent_at IS NULL;