-- =====================================================
-- CREATE SILICA PLANS TABLE AND WORKFLOW TRACKING
-- Run this in your Supabase SQL Editor
-- =====================================================

-- Create silica_plans table to store silica exposure control plans
CREATE TABLE IF NOT EXISTS public.silica_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_order_id UUID NOT NULL REFERENCES public.job_orders(id) ON DELETE CASCADE,

  -- Employee Information
  employee_name TEXT NOT NULL,
  employee_phone TEXT,
  employees_on_job TEXT[] DEFAULT '{}',

  -- Work Type and Control Plan
  work_types TEXT[] DEFAULT '{}',
  water_delivery TEXT,
  work_location TEXT,
  cutting_time TEXT,
  apf10_required TEXT,
  safety_concerns TEXT,

  -- Signature and Date
  signature TEXT NOT NULL,
  signature_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- PDF Storage
  pdf_url TEXT,
  pdf_base64 TEXT, -- Fallback if storage fails

  -- Tracking
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint: one silica plan per job
  UNIQUE(job_order_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_silica_plans_job_order ON public.silica_plans(job_order_id);
CREATE INDEX IF NOT EXISTS idx_silica_plans_created_at ON public.silica_plans(created_at DESC);

-- Enable RLS
ALTER TABLE public.silica_plans ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.silica_plans;
CREATE POLICY "Enable read access for authenticated users"
  ON public.silica_plans FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.silica_plans;
CREATE POLICY "Enable insert for authenticated users"
  ON public.silica_plans FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.silica_plans;
CREATE POLICY "Enable update for authenticated users"
  ON public.silica_plans FOR UPDATE
  TO authenticated
  USING (true);

-- Create operator_status_history table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.operator_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_order_id UUID NOT NULL REFERENCES public.job_orders(id) ON DELETE CASCADE,

  -- Status tracking
  status TEXT NOT NULL CHECK (status IN ('in_route', 'in_progress', 'completed', 'cancelled')),

  -- Timestamps for each status
  route_started_at TIMESTAMPTZ,
  work_started_at TIMESTAMPTZ,
  work_completed_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint: one active status record per operator per job
  UNIQUE(operator_id, job_order_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_operator_status_operator ON public.operator_status_history(operator_id);
CREATE INDEX IF NOT EXISTS idx_operator_status_job ON public.operator_status_history(job_order_id);
CREATE INDEX IF NOT EXISTS idx_operator_status_status ON public.operator_status_history(status);

-- Enable RLS
ALTER TABLE public.operator_status_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for operator_status_history
DROP POLICY IF EXISTS "Users can view their own status" ON public.operator_status_history;
CREATE POLICY "Users can view their own status"
  ON public.operator_status_history FOR SELECT
  TO authenticated
  USING (operator_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

DROP POLICY IF EXISTS "Users can insert their own status" ON public.operator_status_history;
CREATE POLICY "Users can insert their own status"
  ON public.operator_status_history FOR INSERT
  TO authenticated
  WITH CHECK (operator_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

DROP POLICY IF EXISTS "Users can update their own status" ON public.operator_status_history;
CREATE POLICY "Users can update their own status"
  ON public.operator_status_history FOR UPDATE
  TO authenticated
  USING (operator_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

-- Create workflow_steps table to track detailed progress
CREATE TABLE IF NOT EXISTS public.workflow_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_order_id UUID NOT NULL REFERENCES public.job_orders(id) ON DELETE CASCADE,
  operator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Step tracking
  current_step TEXT NOT NULL CHECK (current_step IN (
    'not_started',
    'equipment_checklist',
    'in_route',
    'arrived',
    'silica_form',
    'work_performed',
    'pictures',
    'customer_signature',
    'completed'
  )),

  -- Step completion flags
  equipment_checklist_completed BOOLEAN DEFAULT false,
  sms_sent BOOLEAN DEFAULT false,
  silica_form_completed BOOLEAN DEFAULT false,
  work_performed_completed BOOLEAN DEFAULT false,
  pictures_submitted BOOLEAN DEFAULT false,
  customer_signature_received BOOLEAN DEFAULT false,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint
  UNIQUE(job_order_id, operator_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_workflow_steps_job ON public.workflow_steps(job_order_id);
CREATE INDEX IF NOT EXISTS idx_workflow_steps_operator ON public.workflow_steps(operator_id);
CREATE INDEX IF NOT EXISTS idx_workflow_steps_current_step ON public.workflow_steps(current_step);

-- Enable RLS
ALTER TABLE public.workflow_steps ENABLE ROW LEVEL SECURITY;

-- RLS Policies for workflow_steps
DROP POLICY IF EXISTS "Users can view their own workflow" ON public.workflow_steps;
CREATE POLICY "Users can view their own workflow"
  ON public.workflow_steps FOR SELECT
  TO authenticated
  USING (operator_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

DROP POLICY IF EXISTS "Users can insert their own workflow" ON public.workflow_steps;
CREATE POLICY "Users can insert their own workflow"
  ON public.workflow_steps FOR INSERT
  TO authenticated
  WITH CHECK (operator_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

DROP POLICY IF EXISTS "Users can update their own workflow" ON public.workflow_steps;
CREATE POLICY "Users can update their own workflow"
  ON public.workflow_steps FOR UPDATE
  TO authenticated
  USING (operator_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

-- Grant permissions
GRANT ALL ON public.silica_plans TO authenticated;
GRANT ALL ON public.operator_status_history TO authenticated;
GRANT ALL ON public.workflow_steps TO authenticated;

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Tables created successfully!';
  RAISE NOTICE '- silica_plans';
  RAISE NOTICE '- operator_status_history';
  RAISE NOTICE '- workflow_steps';
  RAISE NOTICE 'Now create the storage bucket: job-attachments (public)';
END $$;
