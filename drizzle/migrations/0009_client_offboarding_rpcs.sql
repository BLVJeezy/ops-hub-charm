CREATE OR REPLACE FUNCTION public.offboard_client(
  _client_id uuid,
  _services text[],
  _all boolean,
  _end_date date,
  _reason text DEFAULT '',
  _credit_notes jsonb DEFAULT '[]'::jsonb,
  _stop_invoices boolean DEFAULT true,
  _stop_tasks boolean DEFAULT true,
  _end_agreements boolean DEFAULT true,
  _pause_client boolean DEFAULT true,
  _close_videos boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.clients%ROWTYPE;
  inv public.invoices%ROWTYPE;
  item jsonb;
  cn_inv_id uuid;
  cn_amount numeric;
  cn_row public.credit_notes%ROWTYPE;
  created_cns jsonb := '[]'::jsonb;
  created_cn_numbers text[] := ARRAY[]::text[];
  stopped_inv_ids uuid[] := ARRAY[]::uuid[];
  stopped_invoices_count integer := 0;
  stopped_recurring_count integer := 0;
  deleted_tasks_count integer := 0;
  ended_agreement_refs text[] := ARRAY[]::text[];
  deleted_videos_count integer := 0;
  stop_social boolean;
  stop_seo boolean;
  stop_website boolean;
  new_social_end_date date;
  new_seo_end_date date;
  new_web_monthly numeric;
  new_web_yearly numeric;
  rem_social boolean;
  rem_seo boolean;
  rem_web boolean;
  should_pause boolean;
  new_status public.client_status;
  svc_labels text[] := ARRAY[]::text[];
  svc_text text;
  reason_clean text;
  summary_line text;
  new_notes text;
  end_month date;
  eff_date date := COALESCE(_end_date, CURRENT_DATE);
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Alleen beheerders kunnen een samenwerking stopzetten.';
  END IF;

  SELECT * INTO c FROM public.clients WHERE id = _client_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Klant niet gevonden.';
  END IF;

  -- 1. Create credit notes
  IF _credit_notes IS NOT NULL AND jsonb_typeof(_credit_notes) = 'array' THEN
    FOR item IN SELECT * FROM jsonb_array_elements(_credit_notes)
    LOOP
      cn_inv_id := (item->>'invoice_id')::uuid;
      cn_amount := round(((item->>'amount')::numeric), 2);

      SELECT * INTO inv FROM public.invoices WHERE id = cn_inv_id AND client = _client_id FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Factuur % niet gevonden voor deze klant.', cn_inv_id;
      END IF;
      IF inv.status NOT IN ('Sent', 'Paid') THEN
        RAISE EXCEPTION 'Creditnota kan alleen voor verstuurde of betaalde facturen.';
      END IF;
      IF cn_amount IS NULL OR cn_amount <= 0 OR cn_amount > COALESCE(inv.total, 0) THEN
        RAISE EXCEPTION 'Ongeldig creditbedrag voor factuur %.', inv.invoice_number;
      END IF;

      INSERT INTO public.credit_notes (
        credit_number,
        invoice_id,
        client,
        client_name,
        client_address,
        client_vat_number,
        date,
        amount,
        reason,
        line_items,
        vat_note,
        status,
        created_by
      )
      VALUES (
        '',
        inv.id,
        inv.client,
        inv.client_name,
        inv.client_address,
        inv.client_vat_number,
        eff_date,
        cn_amount,
        COALESCE(NULLIF(btrim(_reason), ''), 'Volledige terugbetaling van de vooruitbetaling'),
        inv.line_items,
        inv.vat_note,
        'Draft',
        auth.uid()
      )
      RETURNING * INTO cn_row;

      created_cns := created_cns || jsonb_build_object(
        'id', cn_row.id,
        'credit_number', cn_row.credit_number,
        'amount', cn_row.amount
      );
      created_cn_numbers := array_append(created_cn_numbers, cn_row.credit_number);
    END LOOP;
  END IF;

  -- 2. Stop repeating monthly invoices & delete unsent draft children
  IF _stop_invoices THEN
    SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
      INTO stopped_inv_ids
      FROM public.invoices
      WHERE client = _client_id AND repeat_monthly = true;

    stopped_invoices_count := COALESCE(array_length(stopped_inv_ids, 1), 0);

    IF stopped_invoices_count > 0 THEN
      UPDATE public.invoices
        SET repeat_monthly = false,
            next_repeat_on = NULL,
            repeat_day = NULL,
            repeat_hour = NULL,
            repeat_stopped_at = now()
        WHERE id = ANY(stopped_inv_ids);

      DELETE FROM public.invoices
        WHERE repeat_parent = ANY(stopped_inv_ids)
          AND status = 'Draft'
          AND sent_at IS NULL;
    END IF;
  END IF;

  -- 3. Stop recurring tasks and delete open future tasks
  IF _stop_tasks THEN
    UPDATE public.client_recurring_tasks
      SET active = false
      WHERE client_id = _client_id AND active = true;
    GET DIAGNOSTICS stopped_recurring_count = ROW_COUNT;

    DELETE FROM public.client_tasks
      WHERE client_id = _client_id
        AND done_at IS NULL
        AND due_date IS NOT NULL
        AND due_date > eff_date;
    GET DIAGNOSTICS deleted_tasks_count = ROW_COUNT;
  END IF;

  -- 4. End active agreements
  IF _end_agreements THEN
    WITH ended AS (
      UPDATE public.client_agreements
        SET status = 'Beëindigd', updated_at = now()
        WHERE client_id = _client_id
          AND status IN ('Concept', 'Verstuurd', 'Ondertekend')
        RETURNING reference
    )
    SELECT COALESCE(array_agg(reference), ARRAY[]::text[]) INTO ended_agreement_refs FROM ended;
  END IF;

  -- 5. Close unfinished video projects from end month onwards
  IF _close_videos THEN
    end_month := date_trunc('month', eff_date)::date;
    DELETE FROM public.video_projects
      WHERE client_id = _client_id
        AND status NOT IN ('goedgekeurd', 'afgerond')
        AND month >= end_month;
    GET DIAGNOSTICS deleted_videos_count = ROW_COUNT;
  END IF;

  -- 6. Service end dates & client status
  stop_social := 'social' = ANY(COALESCE(_services, ARRAY[]::text[]));
  stop_seo := 'seo' = ANY(COALESCE(_services, ARRAY[]::text[]));
  stop_website := 'website' = ANY(COALESCE(_services, ARRAY[]::text[]));

  new_social_end_date := CASE WHEN stop_social THEN eff_date ELSE c.social_end_date END;
  new_seo_end_date := CASE WHEN stop_seo THEN eff_date ELSE c.seo_end_date END;
  new_web_monthly := CASE WHEN stop_website THEN NULL ELSE c.website_monthly_fee END;
  new_web_yearly := CASE WHEN stop_website THEN NULL ELSE c.website_yearly_fee END;

  rem_social := COALESCE(c.social_monthly_fee, 0) > 0
    AND (new_social_end_date IS NULL OR new_social_end_date > eff_date);
  rem_seo := (COALESCE(c.monthly_fee, 0) > 0 OR COALESCE(c.yearly_fee, 0) > 0 OR (c.seo_package IS NOT NULL AND c.seo_package <> 'None'))
    AND (new_seo_end_date IS NULL OR new_seo_end_date > eff_date);
  rem_web := COALESCE(new_web_monthly, 0) > 0 OR COALESCE(new_web_yearly, 0) > 0;

  should_pause := _pause_client AND (_all OR NOT (rem_social OR rem_seo OR rem_web));
  new_status := CASE WHEN should_pause THEN 'Paused'::public.client_status ELSE c.status END;

  IF stop_social THEN svc_labels := array_append(svc_labels, 'Social media'); END IF;
  IF stop_seo THEN svc_labels := array_append(svc_labels, 'SEO'); END IF;
  IF stop_website THEN svc_labels := array_append(svc_labels, 'Website onderhoud/hosting'); END IF;
  svc_text := CASE
    WHEN COALESCE(array_length(svc_labels, 1), 0) = 0 THEN 'alle diensten'
    ELSE array_to_string(svc_labels, ', ')
  END;

  reason_clean := btrim(COALESCE(_reason, ''));
  summary_line := to_char(eff_date, 'DD-MM-YYYY') || ': Samenwerking ' || svc_text || ' stopgezet.';
  IF reason_clean <> '' THEN
    summary_line := summary_line || ' ' || reason_clean || CASE WHEN right(reason_clean, 1) = '.' THEN '' ELSE '.' END;
  END IF;
  IF COALESCE(array_length(created_cn_numbers, 1), 0) > 0 THEN
    summary_line := summary_line || ' Creditnota''s: ' || array_to_string(created_cn_numbers, ', ') || '.';
  END IF;

  new_notes := CASE
    WHEN c.notes IS NULL OR btrim(c.notes) = '' THEN summary_line
    ELSE c.notes || E'\n' || summary_line
  END;

  UPDATE public.clients
    SET social_end_date = new_social_end_date,
        seo_end_date = new_seo_end_date,
        website_monthly_fee = new_web_monthly,
        website_yearly_fee = new_web_yearly,
        status = new_status,
        next_followup_date = CASE WHEN should_pause THEN NULL ELSE c.next_followup_date END,
        notes = new_notes,
        updated_at = now()
    WHERE id = _client_id;

  IF should_pause AND c.status <> 'Paused'::public.client_status THEN
    INSERT INTO public.client_status_log (client, from_status, to_status, date, created_by)
    VALUES (_client_id, c.status::text, 'Paused', eff_date, auth.uid());
  END IF;

  -- 7. Always log in contact_log
  INSERT INTO public.contact_log (client, date, channel, direction, note, created_by)
  VALUES (_client_id, eff_date, 'Email'::public.contact_channel, 'Outreach'::public.contact_direction, summary_line, auth.uid());

  RETURN jsonb_build_object(
    'credit_notes', created_cns,
    'stopped_invoices', stopped_invoices_count,
    'stopped_recurring_tasks', stopped_recurring_count,
    'deleted_tasks', deleted_tasks_count,
    'ended_agreements', to_jsonb(ended_agreement_refs),
    'deleted_videos', deleted_videos_count,
    'new_status', new_status::text,
    'summary_line', summary_line
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reactivate_client(
  _client_id uuid,
  _services text[] DEFAULT ARRAY[]::text[],
  _date date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.clients%ROWTYPE;
  eff_date date := COALESCE(_date, CURRENT_DATE);
  clear_social boolean := 'social' = ANY(COALESCE(_services, ARRAY[]::text[]));
  clear_seo boolean := 'seo' = ANY(COALESCE(_services, ARRAY[]::text[]));
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Alleen beheerders kunnen een klant heractiveren.';
  END IF;

  SELECT * INTO c FROM public.clients WHERE id = _client_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Klant niet gevonden.';
  END IF;

  UPDATE public.clients
    SET status = 'Active'::public.client_status,
        social_end_date = CASE WHEN clear_social THEN NULL ELSE c.social_end_date END,
        seo_end_date = CASE WHEN clear_seo THEN NULL ELSE c.seo_end_date END,
        updated_at = now()
    WHERE id = _client_id;

  IF c.status <> 'Active'::public.client_status THEN
    INSERT INTO public.client_status_log (client, from_status, to_status, date, created_by)
    VALUES (_client_id, c.status::text, 'Active', eff_date, auth.uid());
  END IF;

  RETURN jsonb_build_object('ok', true, 'new_status', 'Active');
END;
$$;

REVOKE ALL ON FUNCTION public.offboard_client(uuid, text[], boolean, date, text, jsonb, boolean, boolean, boolean, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.offboard_client(uuid, text[], boolean, date, text, jsonb, boolean, boolean, boolean, boolean, boolean) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.reactivate_client(uuid, text[], date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reactivate_client(uuid, text[], date) TO authenticated, service_role;