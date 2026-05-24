-- ============================================================
-- Peer Ratings System
-- Operators / helpers / supervisors rate each other after jobs
-- ============================================================

-- 1. Rating form templates (ops_manager creates these)
CREATE TABLE IF NOT EXISTS public.rating_forms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  -- which roles can be rated with this form (e.g. ['operator','apprentice'])
  target_roles TEXT[] NOT NULL DEFAULT '{}',
  -- which roles can submit this form (e.g. ['operator','apprentice','supervisor'])
  rater_roles TEXT[] NOT NULL DEFAULT '{}',
  -- questions: [{id: uuid, text: string, type: 'rating_5'|'rating_10'|'yes_no'|'text', required: bool}]
  questions JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Submitted ratings
CREATE TABLE IF NOT EXISTS public.rating_submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  form_id UUID NOT NULL REFERENCES public.rating_forms(id) ON DELETE CASCADE,
  -- job context (optional — can be submitted without a job)
  job_order_id UUID REFERENCES public.job_orders(id) ON DELETE SET NULL,
  rater_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ratee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- responses: {question_id: value} — values are number|boolean|string
  responses JSONB NOT NULL DEFAULT '{}',
  -- auto-computed average of all numeric (rating_5/rating_10) answers, null if no numeric
  overall_score NUMERIC(4,2),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- one submission per rater/ratee/form/job combo
  UNIQUE(form_id, rater_id, ratee_id, job_order_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS rating_forms_tenant_idx ON public.rating_forms(tenant_id);
CREATE INDEX IF NOT EXISTS rating_submissions_tenant_idx ON public.rating_submissions(tenant_id);
CREATE INDEX IF NOT EXISTS rating_submissions_ratee_idx ON public.rating_submissions(ratee_id);
CREATE INDEX IF NOT EXISTS rating_submissions_rater_idx ON public.rating_submissions(rater_id);
CREATE INDEX IF NOT EXISTS rating_submissions_job_idx ON public.rating_submissions(job_order_id);

-- updated_at trigger for rating_forms
CREATE OR REPLACE FUNCTION public.update_rating_forms_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS rating_forms_updated_at ON public.rating_forms;
CREATE TRIGGER rating_forms_updated_at BEFORE UPDATE ON public.rating_forms
  FOR EACH ROW EXECUTE FUNCTION public.update_rating_forms_updated_at();

-- RLS
ALTER TABLE public.rating_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rating_submissions ENABLE ROW LEVEL SECURITY;

-- rating_forms: ops_manager/admin/super_admin can create/edit; all tenant users can read active forms
DO $$ BEGIN
  CREATE POLICY "rating_forms_read" ON public.rating_forms FOR SELECT
    USING (tenant_id = public.current_user_tenant_id() AND is_active = true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "rating_forms_manage" ON public.rating_forms FOR ALL
    USING (public.current_user_has_role('super_admin','admin','operations_manager') AND tenant_id = public.current_user_tenant_id())
    WITH CHECK (public.current_user_has_role('super_admin','admin','operations_manager') AND tenant_id = public.current_user_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- rating_submissions: rater can insert their own; ratee can read their own; admin/ops_mgr can read all in tenant
DO $$ BEGIN
  CREATE POLICY "rating_submissions_insert" ON public.rating_submissions FOR INSERT
    WITH CHECK (rater_id = auth.uid() AND tenant_id = public.current_user_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "rating_submissions_read_own" ON public.rating_submissions FOR SELECT
    USING (
      (rater_id = auth.uid() OR ratee_id = auth.uid())
      AND tenant_id = public.current_user_tenant_id()
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "rating_submissions_read_admin" ON public.rating_submissions FOR SELECT
    USING (public.current_user_has_role('super_admin','admin','operations_manager') AND tenant_id = public.current_user_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Seed: default rating form for PATRIOT tenant
INSERT INTO public.rating_forms (tenant_id, title, description, target_roles, rater_roles, questions, created_by)
SELECT
  t.id,
  'Field Performance Review',
  'Rate your coworker after completing a job together',
  ARRAY['operator','apprentice'],
  ARRAY['operator','apprentice','supervisor'],
  '[
    {"id":"q1","text":"Showed up on time and ready to work","type":"rating_5","required":true},
    {"id":"q2","text":"Communicated clearly throughout the job","type":"rating_5","required":true},
    {"id":"q3","text":"Followed safety procedures","type":"rating_5","required":true},
    {"id":"q4","text":"Contributed effectively to completing the work","type":"rating_5","required":true},
    {"id":"q5","text":"Would you recommend working with this person again?","type":"yes_no","required":true},
    {"id":"q6","text":"Any additional comments (optional)","type":"text","required":false}
  ]'::jsonb,
  (SELECT id FROM auth.users WHERE email = 'andres.altamirano1280@gmail.com' LIMIT 1)
FROM public.tenants t WHERE t.company_code = 'PATRIOT'
ON CONFLICT DO NOTHING;
