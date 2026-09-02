-- Keep existing invoice numbers intact, but store all future identifiers as
-- seven-character codes such as XIZ37M8.
DROP TRIGGER IF EXISTS trg_invoice_number ON public.invoices;
DROP FUNCTION IF EXISTS public.assign_invoice_number();

ALTER TABLE public.invoices
  ALTER COLUMN invoice_number TYPE TEXT USING invoice_number::TEXT;

CREATE OR REPLACE FUNCTION public.assign_invoice_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  candidate TEXT;
BEGIN
  IF NEW.invoice_number IS NULL OR btrim(NEW.invoice_number) = '' THEN
    -- Serialize the tiny code-allocation section so the uniqueness check is
    -- also safe when two invoices are created at exactly the same time.
    PERFORM pg_advisory_xact_lock(hashtext('public.invoices.invoice_number')::BIGINT);

    LOOP
      candidate :=
        chr(65 + floor(random() * 26)::INTEGER) ||
        chr(65 + floor(random() * 26)::INTEGER) ||
        chr(65 + floor(random() * 26)::INTEGER) ||
        lpad(floor(random() * 100)::INTEGER::TEXT, 2, '0') ||
        chr(65 + floor(random() * 26)::INTEGER) ||
        floor(random() * 10)::INTEGER::TEXT;

      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.invoices WHERE invoice_number = candidate
      );
    END LOOP;

    NEW.invoice_number := candidate;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_invoice_number
  BEFORE INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.assign_invoice_number();
