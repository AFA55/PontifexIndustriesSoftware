-- Ensure job_notes table exists (idempotent — table was created in 20260302_create_job_notes.sql)
-- This migration adds support for operator amendment notes (note_type: 'amendment', 'done_for_day', 'completion')
-- and ensures operators can insert their own notes (previously only admins had RLS access).

CREATE TABLE IF NOT EXISTS job_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_order_id uuid NOT NULL REFERENCES job_orders(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  author_name text NOT NULL DEFAULT '',
  tenant_id uuid,
  content text NOT NULL,
  note_type varchar(50) DEFAULT 'general',
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes (idempotent)
CREATE INDEX IF NOT EXISTS idx_job_notes_job_order_id ON job_notes(job_order_id);
CREATE INDEX IF NOT EXISTS idx_job_notes_author_id ON job_notes(author_id);
CREATE INDEX IF NOT EXISTS idx_job_notes_tenant ON job_notes(tenant_id);

-- Allow operators to insert their own notes (in addition to the existing admin policy)
DO $$ BEGIN
  CREATE POLICY "Operators can insert their own notes" ON public.job_notes
    FOR INSERT
    WITH CHECK (author_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Allow operators to view notes for jobs assigned to them
DO $$ BEGIN
  CREATE POLICY "Operators can read notes for their jobs" ON public.job_notes
    FOR SELECT
    USING (
      author_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
        AND role IN ('admin', 'super_admin', 'operations_manager', 'shop_manager')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
