ALTER FUNCTION public.move_to_dlq(text,text,bigint,jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.read_email_batch(text,integer,integer) SET search_path = public, pgmq;
ALTER FUNCTION public.enqueue_email(text,jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.delete_email(text,bigint) SET search_path = public, pgmq;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','sales','ops'));
$$;

DROP POLICY IF EXISTS "ContactLog insert authed" ON public.contact_log;
DROP POLICY IF EXISTS "ContactLog read authed" ON public.contact_log;
CREATE POLICY "ContactLog insert staff" ON public.contact_log FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "ContactLog read staff" ON public.contact_log FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "StatusLog insert authed" ON public.client_status_log;
DROP POLICY IF EXISTS "StatusLog read authed" ON public.client_status_log;
CREATE POLICY "StatusLog insert staff" ON public.client_status_log FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "StatusLog read staff" ON public.client_status_log FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Invoices insert authed" ON public.invoices;
DROP POLICY IF EXISTS "Invoices read authed" ON public.invoices;
DROP POLICY IF EXISTS "Invoices update authed" ON public.invoices;
CREATE POLICY "Invoices insert staff" ON public.invoices FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Invoices read staff" ON public.invoices FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Invoices update staff" ON public.invoices FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Clients insert authed" ON public.clients;
DROP POLICY IF EXISTS "Clients read all authed" ON public.clients;
DROP POLICY IF EXISTS "Clients update authed" ON public.clients;
CREATE POLICY "Clients insert staff" ON public.clients FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Clients read staff" ON public.clients FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Clients update staff" ON public.clients FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Expenses insert authed" ON public.expenses;
DROP POLICY IF EXISTS "Expenses read authed" ON public.expenses;
DROP POLICY IF EXISTS "Expenses update authed" ON public.expenses;
CREATE POLICY "Expenses insert staff" ON public.expenses FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Expenses read staff" ON public.expenses FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Expenses update staff" ON public.expenses FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Actions insert authed" ON public.actions;
DROP POLICY IF EXISTS "Actions read authed" ON public.actions;
DROP POLICY IF EXISTS "Actions update authed" ON public.actions;
CREATE POLICY "Actions insert staff" ON public.actions FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Actions read staff" ON public.actions FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Actions update staff" ON public.actions FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Client documents insert authed" ON public.client_documents;
DROP POLICY IF EXISTS "Client documents read all authed" ON public.client_documents;
DROP POLICY IF EXISTS "Client documents update authed" ON public.client_documents;
CREATE POLICY "Client documents insert staff" ON public.client_documents FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Client documents read staff" ON public.client_documents FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Client documents update staff" ON public.client_documents FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Onboarding authed insert" ON public.onboarding_submissions;
DROP POLICY IF EXISTS "Onboarding public insert" ON public.onboarding_submissions;
CREATE POLICY "Onboarding staff insert" ON public.onboarding_submissions FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Profiles readable by authenticated" ON public.profiles;
CREATE POLICY "Profiles readable by staff" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id OR public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "client-documents read authed" ON storage.objects;
DROP POLICY IF EXISTS "client-documents insert authed" ON storage.objects;
CREATE POLICY "client-documents read staff" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'client-documents' AND public.is_staff(auth.uid()));
CREATE POLICY "client-documents insert staff" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'client-documents' AND public.is_staff(auth.uid()));