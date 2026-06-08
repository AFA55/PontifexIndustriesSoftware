-- APPLIED TO PROD 2026-06-08 via Supabase MCP (feedback_submissions_20260608).
-- Operator/helper "report an issue / suggest a change" submissions, triaged in the
-- Pontifex Hub. Additive; tenant_id + RLS via SECURITY DEFINER helpers.
CREATE TABLE IF NOT EXISTS public.feedback_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  reporter_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reporter_role text,
  type text NOT NULL DEFAULT 'bug' CHECK (type IN ('bug','change_request','idea')),
  title text,
  body text NOT NULL,
  page_url text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_review','planned','done','declined')),
  admin_response text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_tenant_status ON public.feedback_submissions(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_reporter ON public.feedback_submissions(reporter_id);

ALTER TABLE public.feedback_submissions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "feedback_reporter_insert_own" ON public.feedback_submissions
    FOR INSERT WITH CHECK (reporter_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "feedback_reporter_read_own" ON public.feedback_submissions
    FOR SELECT USING (reporter_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "feedback_admin_all" ON public.feedback_submissions
    FOR ALL
    USING (
      public.current_user_has_role('admin','super_admin','operations_manager')
      AND (public.current_user_role() = 'super_admin' OR tenant_id = public.current_user_tenant_id())
    )
    WITH CHECK (
      public.current_user_has_role('admin','super_admin','operations_manager')
      AND (public.current_user_role() = 'super_admin' OR tenant_id = public.current_user_tenant_id())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
