-- ─── 1. Job Scope Items ────────────────────────────────────────────────────────
-- Defines the planned scope of work for a job (set by admin)
CREATE TABLE IF NOT EXISTS job_scope_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  job_order_id    UUID NOT NULL REFERENCES job_orders(id) ON DELETE CASCADE,
  work_type       TEXT NOT NULL,          -- e.g. 'wall_sawing', 'core_drilling', 'cleanup'
  description     TEXT,                   -- e.g. 'Wall sawing - north wall'
  unit            TEXT NOT NULL DEFAULT 'linear_ft',  -- linear_ft, sq_ft, holes, hours, items
  target_quantity NUMERIC(10,2) NOT NULL DEFAULT 0,
  sort_order      INTEGER DEFAULT 0,
  added_by        UUID REFERENCES profiles(id),
  added_at        TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 2. Job Progress Entries ──────────────────────────────────────────────────
-- Daily progress logs submitted by operators
CREATE TABLE IF NOT EXISTS job_progress_entries (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  job_order_id        UUID NOT NULL REFERENCES job_orders(id) ON DELETE CASCADE,
  scope_item_id       UUID REFERENCES job_scope_items(id) ON DELETE SET NULL,
  operator_id         UUID NOT NULL REFERENCES profiles(id),
  date                DATE NOT NULL DEFAULT CURRENT_DATE,
  quantity_completed  NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes               TEXT,
  work_type           TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 3. Job Completion Requests ───────────────────────────────────────────────
-- Operator submits → salesperson/admin reviews → officially complete
CREATE TABLE IF NOT EXISTS job_completion_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  job_order_id    UUID NOT NULL REFERENCES job_orders(id) ON DELETE CASCADE,
  submitted_by    UUID NOT NULL REFERENCES profiles(id),
  submitted_at    TIMESTAMPTZ DEFAULT NOW(),
  operator_notes  TEXT,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','rejected')),
  reviewed_by     UUID REFERENCES profiles(id),
  reviewed_at     TIMESTAMPTZ,
  review_notes    TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 4. Add columns to job_orders ────────────────────────────────────────────
ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS scheduled_end_date DATE;
ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS actual_end_date DATE;
ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS completion_submitted_at TIMESTAMPTZ;

-- ─── 5. RLS Policies ─────────────────────────────────────────────────────────
ALTER TABLE job_scope_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_progress_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_completion_requests ENABLE ROW LEVEL SECURITY;

-- job_scope_items: tenant isolation
CREATE POLICY "tenant_isolation_scope_items" ON job_scope_items
  USING (tenant_id::text = (auth.jwt() -> 'user_metadata' ->> 'tenant_id'));

-- job_progress_entries: tenant isolation
CREATE POLICY "tenant_isolation_progress" ON job_progress_entries
  USING (tenant_id::text = (auth.jwt() -> 'user_metadata' ->> 'tenant_id'));

-- job_completion_requests: tenant isolation
CREATE POLICY "tenant_isolation_completion" ON job_completion_requests
  USING (tenant_id::text = (auth.jwt() -> 'user_metadata' ->> 'tenant_id'));

-- ─── 6. Indexes ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_scope_items_job ON job_scope_items(job_order_id);
CREATE INDEX IF NOT EXISTS idx_progress_job ON job_progress_entries(job_order_id);
CREATE INDEX IF NOT EXISTS idx_progress_operator ON job_progress_entries(operator_id);
CREATE INDEX IF NOT EXISTS idx_progress_date ON job_progress_entries(date);
CREATE INDEX IF NOT EXISTS idx_completion_req_job ON job_completion_requests(job_order_id);
CREATE INDEX IF NOT EXISTS idx_completion_req_status ON job_completion_requests(status);
