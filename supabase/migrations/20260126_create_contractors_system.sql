-- Migration: Create Contractors & Standby System
-- Created: 2026-01-26
-- Description: Adds contractor profiles, job tracking, and standby policy system

-- =====================================================
-- CONTRACTORS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.contractors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Basic Info
  contractor_name TEXT NOT NULL,
  contact_person TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  contact_email TEXT,
  full_address TEXT,

  -- Business Info
  company_type TEXT DEFAULT 'General Contractor',
  tax_id TEXT,

  -- Performance Metrics
  total_jobs_completed INTEGER DEFAULT 0,
  total_revenue DECIMAL(10,2) DEFAULT 0,
  total_standby_hours DECIMAL(8,2) DEFAULT 0,
  total_standby_charges DECIMAL(10,2) DEFAULT 0,
  average_rating DECIMAL(3,2) DEFAULT 0,

  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  preferred_contractor BOOLEAN DEFAULT false,

  -- Notes
  internal_notes TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES public.profiles(id)
);

-- =====================================================
-- CONTRACTOR JOBS (Link contractors to job_orders)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.contractor_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  contractor_id UUID NOT NULL REFERENCES public.contractors(id) ON DELETE CASCADE,
  job_order_id UUID NOT NULL REFERENCES public.job_orders(id) ON DELETE CASCADE,

  -- Job specific info
  po_number TEXT,
  quoted_amount DECIMAL(10,2),
  final_amount DECIMAL(10,2),

  -- Standby tracking
  standby_hours DECIMAL(8,2) DEFAULT 0,
  standby_charges DECIMAL(10,2) DEFAULT 0,
  standby_policy_accepted BOOLEAN DEFAULT false,
  standby_policy_accepted_at TIMESTAMPTZ,

  -- Performance
  operator_rating INTEGER CHECK (operator_rating >= 1 AND operator_rating <= 5),
  contractor_rating INTEGER CHECK (contractor_rating >= 1 AND contractor_rating <= 5),
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(contractor_id, job_order_id)
);

-- =====================================================
-- STANDBY LOGS (Track all standby events)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.standby_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  job_order_id UUID NOT NULL REFERENCES public.job_orders(id) ON DELETE CASCADE,
  operator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  contractor_id UUID REFERENCES public.contractors(id) ON DELETE SET NULL,

  -- Standby details
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  duration_hours DECIMAL(8,2),

  -- Billing
  hourly_rate DECIMAL(10,2) DEFAULT 189.00,
  total_charge DECIMAL(10,2),

  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'disputed')),

  -- Policy
  policy_version TEXT DEFAULT 'v1.0',
  client_acknowledged BOOLEAN DEFAULT false,
  client_acknowledged_at TIMESTAMPTZ,
  client_signature TEXT,

  -- Notes
  reason TEXT,
  operator_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- STANDBY POLICIES (Versioned legal documents)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.standby_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  version TEXT NOT NULL UNIQUE,

  -- Policy content
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  full_document TEXT NOT NULL,

  -- Rates
  hourly_rate DECIMAL(10,2) NOT NULL,
  drive_time_multiplier DECIMAL(3,2) DEFAULT 1.5,
  minimum_charge_hours DECIMAL(4,2) DEFAULT 1.0,

  -- Status
  is_active BOOLEAN DEFAULT true,
  effective_date DATE NOT NULL,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES public.profiles(id)
);

-- =====================================================
-- INDEXES
-- =====================================================
CREATE INDEX idx_contractors_name ON public.contractors(contractor_name);
CREATE INDEX idx_contractors_status ON public.contractors(status);
CREATE INDEX idx_contractors_preferred ON public.contractors(preferred_contractor);

CREATE INDEX idx_contractor_jobs_contractor ON public.contractor_jobs(contractor_id);
CREATE INDEX idx_contractor_jobs_job ON public.contractor_jobs(job_order_id);
CREATE INDEX idx_contractor_jobs_po ON public.contractor_jobs(po_number);

CREATE INDEX idx_standby_logs_job ON public.standby_logs(job_order_id);
CREATE INDEX idx_standby_logs_operator ON public.standby_logs(operator_id);
CREATE INDEX idx_standby_logs_status ON public.standby_logs(status);

CREATE INDEX idx_standby_policies_active ON public.standby_policies(is_active);

-- =====================================================
-- RLS POLICIES
-- =====================================================
ALTER TABLE public.contractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.standby_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.standby_policies ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins full access contractors"
  ON public.contractors FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins full access contractor_jobs"
  ON public.contractor_jobs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins full access standby_logs"
  ON public.standby_logs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Operators can view their own standby logs and create new ones
CREATE POLICY "Operators view own standby logs"
  ON public.standby_logs FOR SELECT
  USING (operator_id = auth.uid());

CREATE POLICY "Operators create standby logs"
  ON public.standby_logs FOR INSERT
  WITH CHECK (operator_id = auth.uid());

CREATE POLICY "Operators update own standby logs"
  ON public.standby_logs FOR UPDATE
  USING (operator_id = auth.uid());

-- Everyone can view active standby policies
CREATE POLICY "Anyone can view active policies"
  ON public.standby_policies FOR SELECT
  USING (is_active = true);

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Update timestamps
CREATE TRIGGER trigger_contractors_updated_at
  BEFORE UPDATE ON public.contractors
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_contractor_jobs_updated_at
  BEFORE UPDATE ON public.contractor_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_standby_logs_updated_at
  BEFORE UPDATE ON public.standby_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Auto-calculate standby duration and charge when ended
CREATE OR REPLACE FUNCTION calculate_standby_charge()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.ended_at IS NOT NULL AND OLD.ended_at IS NULL THEN
    -- Calculate duration in hours
    NEW.duration_hours := EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at)) / 3600.0;

    -- Calculate charge
    NEW.total_charge := NEW.duration_hours * NEW.hourly_rate;

    -- Update status
    NEW.status := 'completed';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_standby_charge
  BEFORE UPDATE ON public.standby_logs
  FOR EACH ROW
  EXECUTE FUNCTION calculate_standby_charge();

-- =====================================================
-- SEED DEFAULT STANDBY POLICY
-- =====================================================
INSERT INTO public.standby_policies (
  version,
  title,
  summary,
  full_document,
  hourly_rate,
  drive_time_multiplier,
  minimum_charge_hours,
  effective_date
) VALUES (
  'v1.0',
  'Pontifex Industries Standby Policy',
  'When work is delayed due to circumstances beyond our control, standby time is billed at $189/hour. Additional drive time for extended delays may apply.',
  '-- Full legal document will be inserted via API --',
  189.00,
  1.5,
  1.0,
  CURRENT_DATE
);
