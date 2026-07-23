-- Takeoffs module — foundation tables (plan: docs/plans/TAKEOFFS_MODULE_PLAN.md)
-- Upload blueprint PDFs, per-page scale calibration, conditions (scope buckets
-- with concrete-cutting fields), measurements (geometry in PDF page coords),
-- and AI scope analysis storage. Idempotent; tenant-scoped RLS via the
-- SECURITY DEFINER helpers (never user_metadata).

-- ── Documents (one uploaded PDF plan set) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.takeoff_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  customer_name text,
  storage_path text NOT NULL,
  file_size_bytes bigint,
  page_count int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing','ready','analyzing','analyzed','failed')),
  ai_scope_summary jsonb,          -- document-level AI rundown (scope, flagged sheets)
  ai_analyzed_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── Pages (one row per sheet; scale + extracted metadata live here) ───────
CREATE TABLE IF NOT EXISTS public.takeoff_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.takeoff_documents(id) ON DELETE CASCADE,
  page_number int NOT NULL,
  width_pt numeric NOT NULL,
  height_pt numeric NOT NULL,
  rotation int NOT NULL DEFAULT 0,
  user_unit numeric NOT NULL DEFAULT 1,
  sheet_number text,               -- 'A-101' — extracted, user-editable
  sheet_title text,
  discipline text,                 -- Architectural/Structural/Plumbing/...
  scale_feet_per_point numeric,    -- null = uncalibrated (measuring blocked)
  scale_label text,                -- '1/4" = 1''-0"' or 'Calibrated'
  page_text text,                  -- full extracted text layer (for search + AI)
  ai_page_summary text,            -- AI: what's on this sheet for a cutting sub
  thumbnail_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, page_number)
);

-- ── Conditions (scope buckets — the trade-specific gap) ───────────────────
CREATE TABLE IF NOT EXISTS public.takeoff_conditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.takeoff_documents(id) ON DELETE CASCADE,
  name text NOT NULL,
  measure_type text NOT NULL CHECK (measure_type IN ('count','linear','area')),
  unit text NOT NULL DEFAULT 'LF',            -- EA | LF | SF
  color text NOT NULL DEFAULT '#7C3AED',
  depth_in numeric,                           -- cut depth (concrete cutting)
  core_diameter_in numeric,                   -- core size
  surface text CHECK (surface IN ('wall','slab','curb','other')),
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── Measurements (geometry ALWAYS in PDF page coordinates) ────────────────
CREATE TABLE IF NOT EXISTS public.takeoff_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  condition_id uuid NOT NULL REFERENCES public.takeoff_conditions(id) ON DELETE CASCADE,
  page_id uuid NOT NULL REFERENCES public.takeoff_pages(id) ON DELETE CASCADE,
  geometry jsonb NOT NULL,          -- {type:'polyline'|'count', points:[[x,y],...]}
  quantity numeric NOT NULL DEFAULT 0,   -- computed in condition.unit (server-verified)
  raw_length_pt numeric,            -- scale-free length in PDF points
  scale_used numeric,               -- feet_per_point at computation time
  label text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_takeoff_documents_tenant ON public.takeoff_documents(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_takeoff_pages_document ON public.takeoff_pages(document_id, page_number);
CREATE INDEX IF NOT EXISTS idx_takeoff_conditions_document ON public.takeoff_conditions(document_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_takeoff_measurements_condition ON public.takeoff_measurements(condition_id);
CREATE INDEX IF NOT EXISTS idx_takeoff_measurements_page ON public.takeoff_measurements(page_id);

-- ── updated_at triggers (shared helper exists as update_updated_at_column) ─
DO $$ BEGIN
  CREATE TRIGGER takeoff_documents_updated_at BEFORE UPDATE ON public.takeoff_documents
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER takeoff_pages_updated_at BEFORE UPDATE ON public.takeoff_pages
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER takeoff_conditions_updated_at BEFORE UPDATE ON public.takeoff_conditions
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER takeoff_measurements_updated_at BEFORE UPDATE ON public.takeoff_measurements
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── RLS (tenant-scoped; estimator roles write, tenant reads) ──────────────
ALTER TABLE public.takeoff_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.takeoff_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.takeoff_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.takeoff_measurements ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY takeoff_documents_select ON public.takeoff_documents FOR SELECT
    USING (tenant_id = public.current_user_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY takeoff_documents_write ON public.takeoff_documents FOR ALL
    USING (tenant_id = public.current_user_tenant_id()
           AND public.current_user_has_role('admin','super_admin','operations_manager','salesman'))
    WITH CHECK (tenant_id = public.current_user_tenant_id()
           AND public.current_user_has_role('admin','super_admin','operations_manager','salesman'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY takeoff_pages_select ON public.takeoff_pages FOR SELECT
    USING (tenant_id = public.current_user_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY takeoff_pages_write ON public.takeoff_pages FOR ALL
    USING (tenant_id = public.current_user_tenant_id()
           AND public.current_user_has_role('admin','super_admin','operations_manager','salesman'))
    WITH CHECK (tenant_id = public.current_user_tenant_id()
           AND public.current_user_has_role('admin','super_admin','operations_manager','salesman'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY takeoff_conditions_select ON public.takeoff_conditions FOR SELECT
    USING (tenant_id = public.current_user_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY takeoff_conditions_write ON public.takeoff_conditions FOR ALL
    USING (tenant_id = public.current_user_tenant_id()
           AND public.current_user_has_role('admin','super_admin','operations_manager','salesman'))
    WITH CHECK (tenant_id = public.current_user_tenant_id()
           AND public.current_user_has_role('admin','super_admin','operations_manager','salesman'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY takeoff_measurements_select ON public.takeoff_measurements FOR SELECT
    USING (tenant_id = public.current_user_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY takeoff_measurements_write ON public.takeoff_measurements FOR ALL
    USING (tenant_id = public.current_user_tenant_id()
           AND public.current_user_has_role('admin','super_admin','operations_manager','salesman'))
    WITH CHECK (tenant_id = public.current_user_tenant_id()
           AND public.current_user_has_role('admin','super_admin','operations_manager','salesman'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Storage bucket (private) ───────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('takeoff-documents', 'takeoff-documents', false)
ON CONFLICT (id) DO NOTHING;
