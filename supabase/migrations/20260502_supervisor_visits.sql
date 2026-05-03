-- Supervisor site-visit reports.
-- A supervisor visits an operator on the job, fills out a report.
-- Linked to operator + (optional) job_order being worked that day.

CREATE TABLE IF NOT EXISTS public.supervisor_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- Who visited whom
  supervisor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  supervisor_name text NOT NULL DEFAULT '',
  operator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operator_name text NOT NULL DEFAULT '',

  -- Job context (optional — supervisor may visit operator at shop / between jobs)
  job_order_id uuid REFERENCES public.job_orders(id) ON DELETE SET NULL,
  job_number text,
  customer_name text,

  -- When + where
  visit_date date NOT NULL DEFAULT CURRENT_DATE,
  arrival_time timestamptz,
  departure_time timestamptz,
  latitude double precision,
  longitude double precision,

  -- Report content
  observations text,
  issues_flagged text,
  follow_up_required boolean NOT NULL DEFAULT false,
  follow_up_notes text,

  -- Optional structured ratings (1-5)
  performance_rating int CHECK (performance_rating BETWEEN 1 AND 5),
  safety_rating int CHECK (safety_rating BETWEEN 1 AND 5),
  cleanliness_rating int CHECK (cleanliness_rating BETWEEN 1 AND 5),

  photo_urls jsonb NOT NULL DEFAULT '[]'::jsonb,

  status text NOT NULL DEFAULT 'submitted', -- 'submitted' | 'draft'

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supervisor_visits_tenant ON public.supervisor_visits(tenant_id);
CREATE INDEX IF NOT EXISTS idx_supervisor_visits_supervisor ON public.supervisor_visits(supervisor_id, visit_date DESC);
CREATE INDEX IF NOT EXISTS idx_supervisor_visits_operator ON public.supervisor_visits(operator_id, visit_date DESC);
CREATE INDEX IF NOT EXISTS idx_supervisor_visits_job ON public.supervisor_visits(job_order_id);
CREATE INDEX IF NOT EXISTS idx_supervisor_visits_date ON public.supervisor_visits(visit_date DESC);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.supervisor_visits_set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_supervisor_visits_updated_at ON public.supervisor_visits;
CREATE TRIGGER set_supervisor_visits_updated_at
  BEFORE UPDATE ON public.supervisor_visits
  FOR EACH ROW EXECUTE FUNCTION public.supervisor_visits_set_updated_at();

-- RLS
ALTER TABLE public.supervisor_visits ENABLE ROW LEVEL SECURITY;

-- Supervisor sees + writes their own visits within their tenant.
DO $$ BEGIN
  CREATE POLICY "supervisor_visits_supervisor_own" ON public.supervisor_visits
    FOR ALL
    USING (
      supervisor_id = auth.uid()
      AND (tenant_id IS NULL OR tenant_id = public.current_user_tenant_id())
    )
    WITH CHECK (
      supervisor_id = auth.uid()
      AND (tenant_id IS NULL OR tenant_id = public.current_user_tenant_id())
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Admins / ops / super_admin see + write all visits in their tenant.
-- super_admin bypasses tenant check.
DO $$ BEGIN
  CREATE POLICY "supervisor_visits_admin_all" ON public.supervisor_visits
    FOR ALL
    USING (
      public.current_user_has_role('admin','super_admin','operations_manager')
      AND (
        public.current_user_role() = 'super_admin'
        OR tenant_id = public.current_user_tenant_id()
      )
    )
    WITH CHECK (
      public.current_user_has_role('admin','super_admin','operations_manager')
      AND (
        public.current_user_role() = 'super_admin'
        OR tenant_id = public.current_user_tenant_id()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Operator can read visits about themselves (so they know what was reported).
DO $$ BEGIN
  CREATE POLICY "supervisor_visits_operator_read" ON public.supervisor_visits
    FOR SELECT
    USING (
      operator_id = auth.uid()
      AND tenant_id = public.current_user_tenant_id()
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE public.supervisor_visits IS
  'Site-visit reports a supervisor files after visiting an operator on the job.';
