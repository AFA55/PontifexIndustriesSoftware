-- Migration: Job on-hold status + Documents table
-- Date: 2026-03-25

-- 1. Add 'on_hold' to job_orders status CHECK constraint
ALTER TABLE public.job_orders
  DROP CONSTRAINT IF EXISTS job_orders_status_check;

ALTER TABLE public.job_orders
  ADD CONSTRAINT job_orders_status_check
  CHECK (status IN (
    'scheduled',
    'assigned',
    'in_route',
    'in_progress',
    'on_hold',
    'completed',
    'cancelled'
  ));

-- 2. Add pause/hold tracking columns to job_orders
ALTER TABLE public.job_orders
  ADD COLUMN IF NOT EXISTS pause_reason TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS return_date DATE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS paused_by UUID REFERENCES auth.users(id) DEFAULT NULL;

-- 3. Create job_documents table
CREATE TABLE IF NOT EXISTS public.job_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_order_id UUID NOT NULL REFERENCES public.job_orders(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size BIGINT DEFAULT NULL,
  file_type TEXT DEFAULT NULL,       -- MIME type e.g. 'image/jpeg', 'application/pdf'
  category TEXT NOT NULL DEFAULT 'other',  -- 'site_photo', 'permit', 'customer_doc', 'before_after', 'scope', 'other'
  notes TEXT DEFAULT NULL,
  uploaded_by UUID REFERENCES auth.users(id) DEFAULT NULL,
  uploaded_by_name TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. RLS for job_documents
ALTER TABLE public.job_documents ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage job documents" ON public.job_documents
  FOR ALL USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'super_admin', 'operations_manager')
  );

-- Operators can view documents for their own jobs
CREATE POLICY "Operators can view their job documents" ON public.job_documents
  FOR SELECT USING (
    job_order_id IN (
      SELECT id FROM public.job_orders
      WHERE assigned_to = auth.uid() OR helper_assigned_to = auth.uid()
    )
  );

-- Operators can insert documents for their own jobs
CREATE POLICY "Operators can upload job documents" ON public.job_documents
  FOR INSERT WITH CHECK (
    job_order_id IN (
      SELECT id FROM public.job_orders
      WHERE assigned_to = auth.uid() OR helper_assigned_to = auth.uid()
    )
  );

-- 5. Index for fast lookup by job
CREATE INDEX IF NOT EXISTS idx_job_documents_job_order_id ON public.job_documents(job_order_id);
CREATE INDEX IF NOT EXISTS idx_job_orders_status_on_hold ON public.job_orders(status) WHERE status = 'on_hold';
