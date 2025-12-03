-- Migration: Enhance Document System
-- Created: 2025-01-30
-- Description: Enhances the document system to support comprehensive document templates,
--              field data storage, signatures, photos, and completion tracking

-- =====================================================
-- DROP AND RECREATE ENHANCED TABLES
-- =====================================================

-- Drop existing required_documents table
DROP TABLE IF EXISTS public.required_documents CASCADE;

-- Create enhanced job_documents table
CREATE TABLE public.job_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID REFERENCES public.jobs(id) ON DELETE CASCADE NOT NULL,
  document_template_id TEXT NOT NULL, -- References document ID from document-types.ts
  document_name TEXT NOT NULL,
  document_category TEXT NOT NULL CHECK (document_category IN ('safety', 'compliance', 'operational', 'quality', 'administrative')),

  -- Completion tracking
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'not_applicable')),
  completed_by UUID REFERENCES public.profiles(id),
  completed_at TIMESTAMPTZ,

  -- Form data (stored as JSONB for flexibility)
  form_data JSONB DEFAULT '{}',

  -- Signatures
  operator_signature_url TEXT,
  operator_signature_date TIMESTAMPTZ,
  supervisor_signature_url TEXT,
  supervisor_signature_date TIMESTAMPTZ,
  customer_signature_url TEXT,
  customer_signature_date TIMESTAMPTZ,

  -- Photos
  photo_urls TEXT[], -- Array of photo URLs

  -- File attachments
  file_urls TEXT[], -- Array of file URLs

  -- Notes and comments
  notes TEXT,
  admin_notes TEXT, -- Admin-only notes

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES public.profiles(id)
);

-- Create document history table for audit trail
CREATE TABLE public.document_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID REFERENCES public.job_documents(id) ON DELETE CASCADE NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'completed', 'reopened', 'status_changed')),
  action_by UUID REFERENCES public.profiles(id) NOT NULL,
  action_date TIMESTAMPTZ DEFAULT NOW(),
  changes JSONB, -- Stores what changed
  notes TEXT
);

-- Create document comments table
CREATE TABLE public.document_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID REFERENCES public.job_documents(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) NOT NULL,
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- ENABLE ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE public.job_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_comments ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS POLICIES - JOB DOCUMENTS
-- =====================================================

-- All authenticated users can view documents
CREATE POLICY "All authenticated users can view job documents"
  ON public.job_documents FOR SELECT
  USING (auth.role() = 'authenticated');

-- Admins can insert documents
CREATE POLICY "Admins can insert job documents"
  ON public.job_documents FOR INSERT
  WITH CHECK ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- Admins and assigned operators can update documents
CREATE POLICY "Admins and operators can update job documents"
  ON public.job_documents FOR UPDATE
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    OR
    auth.uid() IN (
      SELECT UNNEST(assigned_operators) FROM public.jobs WHERE id = job_id
    )
  );

-- Admins can delete documents
CREATE POLICY "Admins can delete job documents"
  ON public.job_documents FOR DELETE
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- =====================================================
-- RLS POLICIES - DOCUMENT HISTORY
-- =====================================================

CREATE POLICY "All authenticated users can view document history"
  ON public.document_history FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "All authenticated users can insert document history"
  ON public.document_history FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- =====================================================
-- RLS POLICIES - DOCUMENT COMMENTS
-- =====================================================

CREATE POLICY "All authenticated users can view document comments"
  ON public.document_comments FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "All authenticated users can insert document comments"
  ON public.document_comments FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND user_id = auth.uid());

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

CREATE INDEX idx_job_documents_job_id ON public.job_documents(job_id);
CREATE INDEX idx_job_documents_status ON public.job_documents(status);
CREATE INDEX idx_job_documents_category ON public.job_documents(document_category);
CREATE INDEX idx_job_documents_completed_by ON public.job_documents(completed_by);
CREATE INDEX idx_document_history_document_id ON public.document_history(document_id);
CREATE INDEX idx_document_comments_document_id ON public.document_comments(document_id);

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_job_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_job_documents_timestamp
  BEFORE UPDATE ON public.job_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_job_documents_updated_at();

-- Auto-create history entry when document is completed
CREATE OR REPLACE FUNCTION create_document_completion_history()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    INSERT INTO public.document_history (document_id, action, action_by, notes)
    VALUES (NEW.id, 'completed', NEW.completed_by, 'Document marked as completed');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_document_completion_history
  AFTER UPDATE ON public.job_documents
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed')
  EXECUTE FUNCTION create_document_completion_history();

-- =====================================================
-- VIEWS FOR CONVENIENCE
-- =====================================================

-- View for document completion statistics per job
CREATE OR REPLACE VIEW job_document_stats AS
SELECT
  job_id,
  COUNT(*) as total_documents,
  COUNT(*) FILTER (WHERE status = 'completed') as completed_documents,
  COUNT(*) FILTER (WHERE status = 'pending') as pending_documents,
  COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_documents,
  ROUND(
    (COUNT(*) FILTER (WHERE status = 'completed')::DECIMAL / COUNT(*)) * 100,
    2
  ) as completion_percentage
FROM public.job_documents
GROUP BY job_id;

-- View for operator document assignments
CREATE OR REPLACE VIEW operator_document_assignments AS
SELECT
  jd.id as document_id,
  jd.job_id,
  jd.document_name,
  jd.document_category,
  jd.status,
  jd.completed_at,
  j.title as job_title,
  j.location as job_location,
  j.scheduled_start_date,
  p.id as operator_id,
  p.full_name as operator_name
FROM public.job_documents jd
JOIN public.jobs j ON jd.job_id = j.id
CROSS JOIN LATERAL UNNEST(j.assigned_operators) AS operator_id
JOIN public.profiles p ON p.id = operator_id
WHERE jd.status IN ('pending', 'in_progress');
