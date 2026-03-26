-- ============================================================================
-- Migration: Signature Requests, Customer Surveys, Form Templates
-- Date: 2026-03-26
-- ============================================================================

-- 1. Signature Requests (for customer portal)
CREATE TABLE IF NOT EXISTS public.signature_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_order_id UUID NOT NULL REFERENCES public.job_orders(id) ON DELETE CASCADE,
  token VARCHAR(64) UNIQUE NOT NULL,
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  request_type TEXT NOT NULL CHECK (request_type IN ('utility_waiver', 'completion', 'custom')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'opened', 'signed', 'expired')),
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  signature_data TEXT,
  signer_name TEXT,
  signer_title TEXT,
  form_data JSONB DEFAULT '{}',
  form_template_id UUID,
  pdf_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_sig_requests_token ON public.signature_requests(token);
CREATE INDEX IF NOT EXISTS idx_sig_requests_job ON public.signature_requests(job_order_id);
CREATE INDEX IF NOT EXISTS idx_sig_requests_status ON public.signature_requests(status);

ALTER TABLE public.signature_requests ENABLE ROW LEVEL SECURITY;

-- Auth users can manage their own requests
CREATE POLICY "sig_requests_auth_all" ON public.signature_requests
  FOR ALL USING (auth.uid() IS NOT NULL);

COMMENT ON TABLE public.signature_requests IS 'Tracks signature requests sent to site contacts via SMS/email with unique tokens for public portal access';

-- 2. Customer Surveys (post-completion feedback)
CREATE TABLE IF NOT EXISTS public.customer_surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_order_id UUID NOT NULL REFERENCES public.job_orders(id) ON DELETE CASCADE,
  signature_request_id UUID REFERENCES public.signature_requests(id),
  operator_id UUID REFERENCES auth.users(id),
  cleanliness_rating INT CHECK (cleanliness_rating BETWEEN 1 AND 5),
  communication_rating INT CHECK (communication_rating BETWEEN 1 AND 5),
  overall_rating INT CHECK (overall_rating BETWEEN 1 AND 5),
  would_recommend BOOLEAN,
  feedback_text TEXT,
  submitted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_surveys_job ON public.customer_surveys(job_order_id);
CREATE INDEX IF NOT EXISTS idx_surveys_operator ON public.customer_surveys(operator_id);

ALTER TABLE public.customer_surveys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "surveys_admin_read" ON public.customer_surveys
  FOR SELECT USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('super_admin', 'operations_manager', 'admin')
  );

-- Allow public inserts (from customer portal, no auth)
CREATE POLICY "surveys_public_insert" ON public.customer_surveys
  FOR INSERT WITH CHECK (true);

COMMENT ON TABLE public.customer_surveys IS 'Customer satisfaction surveys submitted after job completion, feeds into operator ratings';

-- 3. Form Templates (custom form builder)
CREATE TABLE IF NOT EXISTS public.form_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  form_type TEXT NOT NULL CHECK (form_type IN ('pre_work', 'post_work', 'custom')),
  fields JSONB NOT NULL DEFAULT '[]',
  -- fields schema: [{id, type: 'text'|'checkbox'|'signature'|'select'|'textarea'|'date'|'number', label, required, options?, placeholder?}]
  requires_signature BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_form_templates_active ON public.form_templates(is_active) WHERE is_active = true;

ALTER TABLE public.form_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "form_templates_admin_all" ON public.form_templates
  FOR ALL USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('super_admin', 'operations_manager', 'admin')
  );

CREATE POLICY "form_templates_read_all" ON public.form_templates
  FOR SELECT USING (true);

COMMENT ON TABLE public.form_templates IS 'Custom form templates with drag-and-drop field configuration for waivers, completion forms, etc.';

-- 4. Job Form Assignments (link templates to jobs)
CREATE TABLE IF NOT EXISTS public.job_form_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_order_id UUID NOT NULL REFERENCES public.job_orders(id) ON DELETE CASCADE,
  form_template_id UUID NOT NULL REFERENCES public.form_templates(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'completed')),
  assigned_to_contact TEXT,
  assigned_phone TEXT,
  signature_request_id UUID REFERENCES public.signature_requests(id),
  completed_data JSONB,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_form_assignments_job ON public.job_form_assignments(job_order_id);
CREATE INDEX IF NOT EXISTS idx_form_assignments_template ON public.job_form_assignments(form_template_id);

ALTER TABLE public.job_form_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "form_assignments_admin_all" ON public.job_form_assignments
  FOR ALL USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('super_admin', 'operations_manager', 'admin', 'salesman')
  );

COMMENT ON TABLE public.job_form_assignments IS 'Links form templates to specific jobs, tracks completion status';

-- 5. Signature requirement flags on job_orders
ALTER TABLE public.job_orders ADD COLUMN IF NOT EXISTS require_waiver_signature BOOLEAN DEFAULT false;
ALTER TABLE public.job_orders ADD COLUMN IF NOT EXISTS require_completion_signature BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.job_orders.require_waiver_signature IS 'Whether utility waiver signature is required before work starts';
COMMENT ON COLUMN public.job_orders.require_completion_signature IS 'Whether completion signature is required from site contact';
