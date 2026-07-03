-- ============================================================================
-- Publish-request approval queue (founder's "customers request → agents
-- publish → we approve" workflow). A customer activating a job creates a
-- pending publish request; Pontifex reviews it in the Platform Hub and
-- approves. Phase 1: approval = green light to run manually in Ads Manager.
-- Phase 2: the SAME approval triggers the Meta/TikTok API publish — the
-- workflow never changes, only what happens behind the Approve button.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.hiring_publish_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.hiring_jobs(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'published')),
  requested_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text,                    -- shown to the customer on rejection
  channels jsonb NOT NULL DEFAULT '[]'::jsonb,  -- snapshot at request time
  daily_budget numeric,                          -- snapshot at request time
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One live request per job (re-activation after rejection creates a new one;
-- the partial unique index only blocks a second PENDING request).
CREATE UNIQUE INDEX IF NOT EXISTS idx_hiring_publish_pending_unique
  ON public.hiring_publish_requests(job_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_hiring_publish_status
  ON public.hiring_publish_requests(status, created_at);
CREATE INDEX IF NOT EXISTS idx_hiring_publish_tenant
  ON public.hiring_publish_requests(tenant_id);

DO $$
BEGIN
  CREATE TRIGGER set_hiring_publish_requests_updated_at
    BEFORE UPDATE ON public.hiring_publish_requests
    FOR EACH ROW EXECUTE FUNCTION public.hiring_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.hiring_publish_requests ENABLE ROW LEVEL SECURITY;

-- Tenant members may read their own requests (status visibility in their
-- dashboard); all writes go through service-role API routes.
DO $$
BEGIN
  CREATE POLICY hiring_publish_tenant_read ON public.hiring_publish_requests
    FOR SELECT USING (tenant_id = public.current_user_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
