
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin','sales','ops');
CREATE TYPE public.client_status AS ENUM ('Prospect','Active','Paused','Write-off');
CREATE TYPE public.pipeline_stage AS ENUM ('Found','Contacted','Interested','Meeting Booked','Meeting Done','Proposal Sent','Negotiating','Converted','Write-off');
CREATE TYPE public.client_sector AS ENUM ('Plumber','Electrician','HVAC','Construction','Cleaning','Medical/Wholesale','Car Detailing','Other');
CREATE TYPE public.writeoff_reason AS ENUM ('No response','Too expensive','Not interested','Bad fit','Other');
CREATE TYPE public.health_status AS ENUM ('Not set','Green','Orange','Red');
CREATE TYPE public.billing_frequency AS ENUM ('Monthly','Yearly');
CREATE TYPE public.seo_package AS ENUM ('None','Basic','Premium','Custom','Pilot');
CREATE TYPE public.invoice_status AS ENUM ('Draft','Sent','Paid');
CREATE TYPE public.expense_category AS ENUM ('Tool','Directory/Citations','Subscription','Other');
CREATE TYPE public.waiting_period AS ENUM ('1 week','2 weeks','3 weeks','4 weeks','Ongoing');
CREATE TYPE public.action_status AS ENUM ('Planned','In Progress','Completed','Blocked');
CREATE TYPE public.contact_channel AS ENUM ('WhatsApp','Phone','Email','In person','Other');
CREATE TYPE public.contact_direction AS ENUM ('Outreach','Response');
CREATE TYPE public.review_status AS ENUM ('Pending','Approved','Rejected');

-- ============ UPDATED_AT TRIGGER ============
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles readable by authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.user_roles WHERE user_id = auth.uid()
  ORDER BY CASE role WHEN 'admin' THEN 1 WHEN 'ops' THEN 2 WHEN 'sales' THEN 3 END LIMIT 1;
$$;

-- Handle new user: create profile + default 'ops' role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles(id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'ops')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ CLIENTS ============
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sector public.client_sector NOT NULL DEFAULT 'Other',
  location TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  billing_address TEXT,
  vat_number TEXT,
  status public.client_status NOT NULL DEFAULT 'Prospect',
  pipeline_stage public.pipeline_stage NOT NULL DEFAULT 'Found',
  writeoff_reason public.writeoff_reason,
  health public.health_status NOT NULL DEFAULT 'Not set',
  website_needed BOOLEAN NOT NULL DEFAULT false,
  website_billing_frequency public.billing_frequency NOT NULL DEFAULT 'Monthly',
  website_setup_fee NUMERIC(12,2),
  website_monthly_fee NUMERIC(12,2),
  website_yearly_fee NUMERIC(12,2),
  seo_package public.seo_package NOT NULL DEFAULT 'None',
  billing_frequency public.billing_frequency NOT NULL DEFAULT 'Monthly',
  monthly_fee NUMERIC(12,2),
  yearly_fee NUMERIC(12,2),
  setup_fee NUMERIC(12,2),
  seo_start_date DATE,
  seo_end_date DATE,
  contract_start_date DATE,
  renewal_date DATE,
  next_followup_date DATE,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clients read all authed" ON public.clients FOR SELECT TO authenticated USING (true);
CREATE POLICY "Clients insert authed" ON public.clients FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Clients update authed" ON public.clients FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Clients delete admin" ON public.clients FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_clients_updated BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ INVOICES ============
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number INTEGER UNIQUE,
  client UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  client_name TEXT,
  client_address TEXT,
  client_vat_number TEXT,
  date DATE NOT NULL,
  line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  vat_note TEXT DEFAULT 'BTW (0% - Reverse Charge)',
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  status public.invoice_status NOT NULL DEFAULT 'Draft',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Invoices read authed" ON public.invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Invoices insert authed" ON public.invoices FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Invoices update authed" ON public.invoices FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Invoices delete admin" ON public.invoices FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_invoices_updated BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-assign invoice_number on insert if null; minimum 26
CREATE OR REPLACE FUNCTION public.assign_invoice_number()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE next_num INTEGER;
BEGIN
  IF NEW.invoice_number IS NULL THEN
    SELECT GREATEST(26, COALESCE(MAX(invoice_number),25)+1) INTO next_num FROM public.invoices;
    NEW.invoice_number := next_num;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_invoice_number BEFORE INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.assign_invoice_number();

-- ============ EXPENSES ============
CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category public.expense_category NOT NULL DEFAULT 'Other',
  monthly_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  linked_client UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Expenses read authed" ON public.expenses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Expenses insert authed" ON public.expenses FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Expenses update authed" ON public.expenses FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Expenses delete admin" ON public.expenses FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_expenses_updated BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ ACTIONS ============
CREATE TABLE public.actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  action_description TEXT NOT NULL,
  start_date DATE,
  waiting_period public.waiting_period NOT NULL DEFAULT '1 week',
  due_date DATE,
  status public.action_status NOT NULL DEFAULT 'Planned',
  result TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.actions TO authenticated;
GRANT ALL ON public.actions TO service_role;
ALTER TABLE public.actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Actions read authed" ON public.actions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Actions insert authed" ON public.actions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Actions update authed" ON public.actions FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Actions delete admin" ON public.actions FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_actions_updated BEFORE UPDATE ON public.actions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ CONTACT LOG ============
CREATE TABLE public.contact_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  channel public.contact_channel NOT NULL DEFAULT 'WhatsApp',
  direction public.contact_direction NOT NULL DEFAULT 'Outreach',
  note TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_log TO authenticated;
GRANT ALL ON public.contact_log TO service_role;
ALTER TABLE public.contact_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ContactLog read authed" ON public.contact_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "ContactLog insert authed" ON public.contact_log FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ContactLog update admin" ON public.contact_log FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "ContactLog delete admin" ON public.contact_log FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- ============ CLIENT STATUS LOG ============
CREATE TABLE public.client_status_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_status_log TO authenticated;
GRANT ALL ON public.client_status_log TO service_role;
ALTER TABLE public.client_status_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "StatusLog read authed" ON public.client_status_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "StatusLog insert authed" ON public.client_status_log FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "StatusLog update admin" ON public.client_status_log FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "StatusLog delete admin" ON public.client_status_log FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- ============ ONBOARDING SUBMISSIONS ============
CREATE TABLE public.onboarding_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name TEXT NOT NULL,
  sector public.client_sector NOT NULL,
  location TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  contact_email TEXT,
  billing_address TEXT,
  vat_number TEXT,
  website_needed TEXT[] DEFAULT '{}',
  services_interested TEXT[] DEFAULT '{}',
  keyword_1 TEXT,
  keyword_2 TEXT,
  keyword_3 TEXT,
  target_audience TEXT,
  notes TEXT,
  submitted_at DATE NOT NULL DEFAULT CURRENT_DATE,
  review_status public.review_status NOT NULL DEFAULT 'Pending',
  linked_client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT INSERT ON public.onboarding_submissions TO anon;
GRANT INSERT ON public.onboarding_submissions TO authenticated;
GRANT SELECT, UPDATE, DELETE ON public.onboarding_submissions TO authenticated;
GRANT ALL ON public.onboarding_submissions TO service_role;
ALTER TABLE public.onboarding_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Onboarding public insert" ON public.onboarding_submissions FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Onboarding authed insert" ON public.onboarding_submissions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Onboarding admin read" ON public.onboarding_submissions FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Onboarding admin update" ON public.onboarding_submissions FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Onboarding admin delete" ON public.onboarding_submissions FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_onboarding_updated BEFORE UPDATE ON public.onboarding_submissions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ REALTIME ============
ALTER PUBLICATION supabase_realtime ADD TABLE public.clients;
ALTER PUBLICATION supabase_realtime ADD TABLE public.invoices;
ALTER PUBLICATION supabase_realtime ADD TABLE public.actions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.expenses;
ALTER PUBLICATION supabase_realtime ADD TABLE public.contact_log;
ALTER PUBLICATION supabase_realtime ADD TABLE public.client_status_log;
ALTER PUBLICATION supabase_realtime ADD TABLE public.onboarding_submissions;
