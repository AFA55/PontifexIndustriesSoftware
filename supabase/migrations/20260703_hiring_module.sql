-- ============================================================================
-- Hiring module ("Pontifex Industries Job Board") — Phase 1 schema
-- Plan: docs/plans/HIRELINE_MODULE_PLAN.md
-- A job = ad campaign (FB/IG/TikTok) + application form + candidate pipeline.
-- All tables tenant-scoped w/ RLS via SECURITY DEFINER helpers (never user_metadata).
-- Public apply-page traffic NEVER hits these tables directly — it goes through
-- service-role API routes; hence no anon policies here.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- hiring_jobs — the central object
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hiring_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- source content (the ONLY required creator input, per Hireline's model)
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  location text,
  -- lifecycle
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'paused', 'closed')),
  slug text NOT NULL UNIQUE,                 -- public apply URL: /apply/[slug]
  -- structured extraction (AI-generated from description, editable)
  pay_min numeric,
  pay_max numeric,
  pay_period text DEFAULT 'hour'
    CHECK (pay_period IN ('hour', 'year', 'week', 'day', 'project')),
  schedule_text text,
  requirements jsonb NOT NULL DEFAULT '[]'::jsonb,   -- ["Must lift 60+ lbs", ...]
  benefits jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- generated ad kit (layered like Hireline: details -> branding -> targeting -> instructions)
  ad_headline text,
  ad_primary_text text,                              -- FB/IG post primary text
  ad_tiktok_caption text,                            -- TikTok-format caption/script
  ad_bullets jsonb NOT NULL DEFAULT '[]'::jsonb,     -- checkmark bullets on the creative
  generation_instructions text,                      -- free-text steering, text-only effects
  target_areas jsonb NOT NULL DEFAULT '[]'::jsonb,   -- geographic targeting descriptors
  channels jsonb NOT NULL DEFAULT '["facebook","instagram","tiktok"]'::jsonb,
  -- language variants (founder's translation feature) + duplication
  language text NOT NULL DEFAULT 'en',
  parent_job_id uuid REFERENCES public.hiring_jobs(id) ON DELETE SET NULL,
  -- manual funnel/spend tracking until the Marketing APIs land (Phase 2)
  daily_budget numeric,
  impressions integer NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,
  total_spend numeric NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_hiring_jobs_tenant ON public.hiring_jobs(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_hiring_jobs_slug ON public.hiring_jobs(slug) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_hiring_jobs_parent ON public.hiring_jobs(parent_job_id) WHERE parent_job_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- hiring_screener_questions — ordered application questions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hiring_screener_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.hiring_jobs(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  question text NOT NULL,
  qtype text NOT NULL DEFAULT 'free_response'
    CHECK (qtype IN ('free_response', 'single_choice')),
  options jsonb NOT NULL DEFAULT '[]'::jsonb,        -- single_choice answer options
  auto_reject boolean NOT NULL DEFAULT false,
  auto_reject_answers jsonb NOT NULL DEFAULT '[]'::jsonb, -- answers that disqualify
  required boolean NOT NULL DEFAULT true,
  is_followup boolean NOT NULL DEFAULT false,        -- asked AFTER applying (resume, location)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hiring_screeners_job ON public.hiring_screener_questions(job_id);
CREATE INDEX IF NOT EXISTS idx_hiring_screeners_tenant ON public.hiring_screener_questions(tenant_id);

-- ---------------------------------------------------------------------------
-- hiring_candidates — applicants in the pipeline
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hiring_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.hiring_jobs(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  phone text,
  email text,
  status text NOT NULL DEFAULT 'unreviewed'
    CHECK (status IN ('unreviewed', 'shortlisted', 'rejected')),
  auto_rejected boolean NOT NULL DEFAULT false,      -- failed an auto-reject screener
  resume_url text,                                   -- storage path, signed-URL served
  candidate_location text,
  language text NOT NULL DEFAULT 'en',               -- which language variant they applied via
  source text NOT NULL DEFAULT 'apply_page',
  applied_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_hiring_candidates_job ON public.hiring_candidates(job_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_hiring_candidates_tenant_status ON public.hiring_candidates(tenant_id, status) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- hiring_candidate_responses — screener answers (question text denormalized so
-- the record stays readable even if the question is later edited/deleted)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hiring_candidate_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.hiring_candidates(id) ON DELETE CASCADE,
  question_id uuid REFERENCES public.hiring_screener_questions(id) ON DELETE SET NULL,
  question_text text NOT NULL,
  answer text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hiring_responses_candidate ON public.hiring_candidate_responses(candidate_id);

-- ---------------------------------------------------------------------------
-- hiring_events — history timeline (clicked_ad, submitted_application,
-- status_changed, comment_added, translated, ...)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hiring_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.hiring_jobs(id) ON DELETE CASCADE,
  candidate_id uuid REFERENCES public.hiring_candidates(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hiring_events_candidate ON public.hiring_events(candidate_id);
CREATE INDEX IF NOT EXISTS idx_hiring_events_job ON public.hiring_events(job_id);

-- ---------------------------------------------------------------------------
-- hiring_comments — internal, team-only notes on a candidate
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hiring_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.hiring_candidates(id) ON DELETE CASCADE,
  author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hiring_comments_candidate ON public.hiring_comments(candidate_id);

-- ---------------------------------------------------------------------------
-- hiring_billing — per-tenant billing state (Hireline-style threshold model:
-- charge on the 1st / at threshold / when all jobs pause). Revenue = ad-spend
-- markup; raw cost never shown to the customer.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hiring_billing (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  stripe_customer_id text,
  default_payment_method text,
  threshold numeric NOT NULL DEFAULT 25,             -- escalates 25 -> 50 -> 250
  lifetime_billed numeric NOT NULL DEFAULT 0,
  balance_owed numeric NOT NULL DEFAULT 0,
  ad_spend_markup numeric NOT NULL DEFAULT 1.5,      -- billed = raw_cost * markup
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- hiring_spend_ledger — per-job spend entries (manual in Phase 1, API-synced in
-- Phase 2). raw_cost = what the ad platform charged us; billed_amount = raw *
-- markup at entry time. Invoice lines aggregate from here.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hiring_spend_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.hiring_jobs(id) ON DELETE SET NULL,
  spend_date date NOT NULL DEFAULT CURRENT_DATE,
  channel text NOT NULL DEFAULT 'facebook'
    CHECK (channel IN ('facebook', 'instagram', 'tiktok')),
  raw_cost numeric NOT NULL DEFAULT 0,
  billed_amount numeric NOT NULL DEFAULT 0,
  invoiced boolean NOT NULL DEFAULT false,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hiring_spend_tenant ON public.hiring_spend_ledger(tenant_id, invoiced);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hiring_set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  CREATE TRIGGER set_hiring_jobs_updated_at
    BEFORE UPDATE ON public.hiring_jobs
    FOR EACH ROW EXECUTE FUNCTION public.hiring_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TRIGGER set_hiring_screeners_updated_at
    BEFORE UPDATE ON public.hiring_screener_questions
    FOR EACH ROW EXECUTE FUNCTION public.hiring_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TRIGGER set_hiring_candidates_updated_at
    BEFORE UPDATE ON public.hiring_candidates
    FOR EACH ROW EXECUTE FUNCTION public.hiring_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TRIGGER set_hiring_billing_updated_at
    BEFORE UPDATE ON public.hiring_billing
    FOR EACH ROW EXECUTE FUNCTION public.hiring_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- RLS — tenant members read; admin-tier roles write. Public apply traffic goes
-- through service-role API routes (BYPASSRLS), so no anon policies exist.
-- ---------------------------------------------------------------------------
ALTER TABLE public.hiring_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hiring_screener_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hiring_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hiring_candidate_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hiring_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hiring_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hiring_billing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hiring_spend_ledger ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY hiring_jobs_tenant_read ON public.hiring_jobs
    FOR SELECT USING (tenant_id = public.current_user_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY hiring_jobs_admin_write ON public.hiring_jobs
    FOR ALL USING (
      tenant_id = public.current_user_tenant_id()
      AND public.current_user_has_role('admin', 'super_admin', 'operations_manager')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY hiring_screeners_tenant_read ON public.hiring_screener_questions
    FOR SELECT USING (tenant_id = public.current_user_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY hiring_screeners_admin_write ON public.hiring_screener_questions
    FOR ALL USING (
      tenant_id = public.current_user_tenant_id()
      AND public.current_user_has_role('admin', 'super_admin', 'operations_manager')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY hiring_candidates_tenant_read ON public.hiring_candidates
    FOR SELECT USING (tenant_id = public.current_user_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY hiring_candidates_admin_write ON public.hiring_candidates
    FOR ALL USING (
      tenant_id = public.current_user_tenant_id()
      AND public.current_user_has_role('admin', 'super_admin', 'operations_manager')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY hiring_responses_tenant_read ON public.hiring_candidate_responses
    FOR SELECT USING (tenant_id = public.current_user_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY hiring_events_tenant_read ON public.hiring_events
    FOR SELECT USING (tenant_id = public.current_user_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY hiring_comments_tenant_read ON public.hiring_comments
    FOR SELECT USING (tenant_id = public.current_user_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY hiring_comments_member_insert ON public.hiring_comments
    FOR INSERT WITH CHECK (
      tenant_id = public.current_user_tenant_id()
      AND author_id = (SELECT auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY hiring_billing_admin_read ON public.hiring_billing
    FOR SELECT USING (
      tenant_id = public.current_user_tenant_id()
      AND public.current_user_has_role('admin', 'super_admin', 'operations_manager')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY hiring_spend_admin_read ON public.hiring_spend_ledger
    FOR SELECT USING (
      tenant_id = public.current_user_tenant_id()
      AND public.current_user_has_role('admin', 'super_admin', 'operations_manager')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
