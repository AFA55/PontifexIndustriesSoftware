-- =============================================================================
-- Schedule & Dispatch Full Deployment
-- =============================================================================
-- Adds color-coded scheduling categories, on-hold support, scope versioning,
-- dispatch priority/status, scope additions, missing-info reminders, and
-- expands the notifications table. Creates active_job_orders_v3 view.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Extend job_orders table
-- ─────────────────────────────────────────────────────────────────────────────

-- Color coding for schedule board
ALTER TABLE public.job_orders
  ADD COLUMN IF NOT EXISTS schedule_color       TEXT,
  ADD COLUMN IF NOT EXISTS schedule_color_label TEXT;

-- Scheduling category (drives auto-color if not overridden)
ALTER TABLE public.job_orders
  ADD COLUMN IF NOT EXISTS schedule_category    TEXT
    CHECK (schedule_category IN (
      'standard', 'emergency', 'government', 'commercial', 'residential',
      'maintenance', 'warranty', 'inspection', 'training', 'internal'
    ));

-- On-hold support
ALTER TABLE public.job_orders
  ADD COLUMN IF NOT EXISTS on_hold             BOOLEAN   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS on_hold_reason      TEXT,
  ADD COLUMN IF NOT EXISTS on_hold_since       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS on_hold_by          UUID      REFERENCES auth.users(id);

-- Scope versioning
ALTER TABLE public.job_orders
  ADD COLUMN IF NOT EXISTS scope_version       INTEGER   NOT NULL DEFAULT 1;

-- Dispatch workflow
ALTER TABLE public.job_orders
  ADD COLUMN IF NOT EXISTS dispatch_status     TEXT      NOT NULL DEFAULT 'unscheduled'
    CHECK (dispatch_status IN (
      'unscheduled', 'scheduled', 'pending_dispatch', 'dispatched',
      'acknowledged', 'en_route', 'on_site', 'completed', 'cancelled'
    )),
  ADD COLUMN IF NOT EXISTS dispatch_priority   INTEGER   NOT NULL DEFAULT 3
    CHECK (dispatch_priority BETWEEN 1 AND 5),  -- 1=critical, 5=low
  ADD COLUMN IF NOT EXISTS dispatch_notes      TEXT;

-- Scope additions (parent/child job linkage)
ALTER TABLE public.job_orders
  ADD COLUMN IF NOT EXISTS is_scope_addition   BOOLEAN   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS parent_job_id       UUID      REFERENCES public.job_orders(id) ON DELETE SET NULL;

-- Reminder tracking
ALTER TABLE public.job_orders
  ADD COLUMN IF NOT EXISTS reminder_sent       BOOLEAN   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_sent_at    TIMESTAMPTZ;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_job_orders_schedule_color
  ON public.job_orders(schedule_color) WHERE schedule_color IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_orders_on_hold
  ON public.job_orders(on_hold) WHERE on_hold = true;
CREATE INDEX IF NOT EXISTS idx_job_orders_dispatch_status
  ON public.job_orders(dispatch_status);
CREATE INDEX IF NOT EXISTS idx_job_orders_dispatch_priority
  ON public.job_orders(dispatch_priority);
CREATE INDEX IF NOT EXISTS idx_job_orders_parent_job_id
  ON public.job_orders(parent_job_id) WHERE parent_job_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Schedule color presets table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.schedule_color_presets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  hex_color   TEXT NOT NULL,
  category    TEXT,               -- maps to schedule_category
  description TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Seed 11 presets
INSERT INTO public.schedule_color_presets (name, hex_color, category, description, sort_order)
VALUES
  ('Standard',     '#6366f1', 'standard',    'Regular scheduled work',               1),
  ('Emergency',    '#ef4444', 'emergency',   'High-priority emergency call-outs',     2),
  ('Government',   '#3b82f6', 'government',  'Government / municipal contracts',      3),
  ('Commercial',   '#8b5cf6', 'commercial',  'Commercial building work',              4),
  ('Residential',  '#10b981', 'residential', 'Residential / homeowner jobs',          5),
  ('Maintenance',  '#f59e0b', 'maintenance', 'Scheduled maintenance visits',          6),
  ('Warranty',     '#06b6d4', 'warranty',    'Warranty call-backs',                   7),
  ('Inspection',   '#84cc16', 'inspection',  'Site inspection or pre-bid walkthrough',8),
  ('Training',     '#f97316', 'training',    'Operator training jobs',                9),
  ('Internal',     '#64748b', 'internal',    'Internal / shop work',                 10),
  ('On Hold',      '#94a3b8', NULL,          'Jobs currently on hold',               11)
ON CONFLICT DO NOTHING;

ALTER TABLE public.schedule_color_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "color_presets_admin_all" ON public.schedule_color_presets
  FOR ALL
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN
      ('super_admin', 'operations_manager', 'admin')
  );

CREATE POLICY "color_presets_read_all" ON public.schedule_color_presets
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Job scope additions table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.job_scope_additions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_job_id    UUID NOT NULL REFERENCES public.job_orders(id) ON DELETE CASCADE,
  child_job_id     UUID          REFERENCES public.job_orders(id) ON DELETE SET NULL,
  description      TEXT NOT NULL,
  requested_by     UUID          REFERENCES auth.users(id),
  approved_by      UUID          REFERENCES auth.users(id),
  status           TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  additional_cost  DECIMAL(10,2),
  additional_hours DECIMAL(6,2),
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.job_scope_additions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scope_additions_admin_all" ON public.job_scope_additions
  FOR ALL
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN
      ('super_admin', 'operations_manager', 'admin', 'salesman')
  );

CREATE POLICY "scope_additions_read_assigned" ON public.job_scope_additions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.job_orders jo
      WHERE jo.id = parent_job_id
        AND (jo.assigned_to = auth.uid() OR jo.created_by = auth.uid())
    )
  );

CREATE INDEX IF NOT EXISTS idx_scope_additions_parent
  ON public.job_scope_additions(parent_job_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Missing info reminders table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.missing_info_reminders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_order_id     UUID NOT NULL REFERENCES public.job_orders(id) ON DELETE CASCADE,
  missing_fields   TEXT[] NOT NULL,           -- e.g. ['address', 'po_number']
  reminder_count   INTEGER NOT NULL DEFAULT 0,
  last_sent_at     TIMESTAMPTZ,
  resolved_at      TIMESTAMPTZ,
  resolved_by      UUID REFERENCES auth.users(id),
  created_by       UUID REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.missing_info_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "missing_info_admin_all" ON public.missing_info_reminders
  FOR ALL
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN
      ('super_admin', 'operations_manager', 'admin', 'salesman')
  );

CREATE INDEX IF NOT EXISTS idx_missing_info_job
  ON public.missing_info_reminders(job_order_id);
CREATE INDEX IF NOT EXISTS idx_missing_info_unresolved
  ON public.missing_info_reminders(job_order_id) WHERE resolved_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Extend schedule_notifications (notifications) table
-- ─────────────────────────────────────────────────────────────────────────────

-- note: metadata column was added in 20260324_notification_types_and_invoice_reminder.sql

ALTER TABLE public.schedule_notifications
  ADD COLUMN IF NOT EXISTS notification_type  TEXT NOT NULL DEFAULT 'in_app'
    CHECK (notification_type IN ('in_app', 'sms', 'email', 'push')),
  ADD COLUMN IF NOT EXISTS delivery_method    TEXT NOT NULL DEFAULT 'in_app'
    CHECK (delivery_method IN ('in_app', 'sms', 'email', 'push', 'webhook')),
  ADD COLUMN IF NOT EXISTS delivery_status    TEXT NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending', 'sent', 'delivered', 'failed', 'cancelled')),
  ADD COLUMN IF NOT EXISTS priority           INTEGER NOT NULL DEFAULT 3
    CHECK (priority BETWEEN 1 AND 5);

CREATE INDEX IF NOT EXISTS idx_notifications_delivery_status
  ON public.schedule_notifications(delivery_status) WHERE delivery_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread
  ON public.schedule_notifications(recipient_id, is_read) WHERE is_read = false;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. auto_color_code_job() trigger function
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.auto_color_code_job()
RETURNS TRIGGER AS $$
BEGIN
  -- Only assign color if not already set
  IF NEW.schedule_color IS NULL AND NEW.schedule_category IS NOT NULL THEN
    SELECT hex_color, name
    INTO   NEW.schedule_color, NEW.schedule_color_label
    FROM   public.schedule_color_presets
    WHERE  category  = NEW.schedule_category
      AND  is_active = true
    LIMIT 1;
  END IF;

  -- Handle on-hold: set color to hold color
  IF NEW.on_hold = true AND (OLD IS NULL OR OLD.on_hold = false) THEN
    SELECT hex_color INTO NEW.schedule_color
    FROM   public.schedule_color_presets
    WHERE  name = 'On Hold' AND is_active = true
    LIMIT 1;
    NEW.schedule_color_label := 'On Hold';
    NEW.on_hold_since        := NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_auto_color_code_job ON public.job_orders;
CREATE TRIGGER trigger_auto_color_code_job
  BEFORE INSERT OR UPDATE OF schedule_category, on_hold ON public.job_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_color_code_job();

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. flag_missing_info() function
--    Called by application code after job creation to detect missing required info
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.flag_missing_info(p_job_order_id UUID)
RETURNS TEXT[] AS $$
DECLARE
  v_job         public.job_orders%ROWTYPE;
  v_missing     TEXT[] := '{}';
BEGIN
  SELECT * INTO v_job FROM public.job_orders WHERE id = p_job_order_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_job.address IS NULL OR TRIM(v_job.address) = '' THEN
    v_missing := array_append(v_missing, 'address');
  END IF;

  IF v_job.scheduled_date IS NULL THEN
    v_missing := array_append(v_missing, 'scheduled_date');
  END IF;

  IF v_job.estimated_hours IS NULL OR v_job.estimated_hours <= 0 THEN
    v_missing := array_append(v_missing, 'estimated_hours');
  END IF;

  IF v_job.customer_name IS NULL OR TRIM(v_job.customer_name) = '' THEN
    v_missing := array_append(v_missing, 'customer_name');
  END IF;

  IF v_job.job_type IS NULL OR TRIM(v_job.job_type) = '' THEN
    v_missing := array_append(v_missing, 'job_type');
  END IF;

  -- If missing fields found, upsert a reminder record
  IF array_length(v_missing, 1) > 0 THEN
    INSERT INTO public.missing_info_reminders (job_order_id, missing_fields, created_by)
    VALUES (p_job_order_id, v_missing, auth.uid())
    ON CONFLICT DO NOTHING;

    -- Also mark the job
    UPDATE public.job_orders
    SET reminder_sent = false
    WHERE id = p_job_order_id;
  ELSE
    -- Resolve any existing open reminder
    UPDATE public.missing_info_reminders
    SET resolved_at = NOW(), resolved_by = auth.uid()
    WHERE job_order_id = p_job_order_id AND resolved_at IS NULL;
  END IF;

  RETURN v_missing;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. active_job_orders_v3 view — enriched with all new dispatch/schedule fields
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.active_job_orders_v3 AS
SELECT
  jo.*,
  -- Operator profile
  p.full_name   AS operator_name,
  p.email       AS operator_email,
  p.phone       AS operator_phone,
  -- Helper profile
  hp.full_name  AS helper_name,
  -- Creator profile
  cp.full_name  AS created_by_name,
  cp.email      AS created_by_email,
  -- Parent job info (if scope addition)
  pj.job_number AS parent_job_number,
  pj.title      AS parent_job_title,
  -- Readable dispatch status
  CASE jo.dispatch_status
    WHEN 'dispatched'   THEN 'Dispatched'
    WHEN 'en_route'     THEN 'En Route'
    WHEN 'on_site'      THEN 'On Site'
    WHEN 'acknowledged' THEN 'Acknowledged'
    WHEN 'completed'    THEN 'Completed'
    WHEN 'cancelled'    THEN 'Cancelled'
    ELSE 'Pending'
  END AS readable_dispatch_status,
  -- Calculated hours
  ROUND((jo.drive_time::DECIMAL      / 60), 2) AS drive_hours,
  ROUND((jo.production_time::DECIMAL / 60), 2) AS production_hours,
  ROUND((jo.total_time::DECIMAL      / 60), 2) AS calc_total_hours,
  -- Missing info flag
  EXISTS (
    SELECT 1 FROM public.missing_info_reminders mir
    WHERE mir.job_order_id = jo.id AND mir.resolved_at IS NULL
  ) AS has_missing_info,
  -- Scope addition count
  COALESCE((
    SELECT COUNT(*)
    FROM public.job_scope_additions jsa
    WHERE jsa.parent_job_id = jo.id AND jsa.status = 'approved'
  ), 0)::INTEGER AS scope_addition_count
FROM public.job_orders jo
LEFT JOIN public.profiles p  ON p.id  = jo.assigned_to
LEFT JOIN public.profiles hp ON hp.id = jo.helper_assigned_to
LEFT JOIN public.profiles cp ON cp.id = jo.created_by
LEFT JOIN public.job_orders pj ON pj.id = jo.parent_job_id
WHERE jo.deleted_at IS NULL
ORDER BY
  CASE jo.dispatch_status
    WHEN 'on_site'      THEN 1
    WHEN 'en_route'     THEN 2
    WHEN 'dispatched'   THEN 3
    WHEN 'acknowledged' THEN 4
    ELSE 5
  END,
  jo.dispatch_priority ASC,
  jo.scheduled_date,
  jo.created_at DESC;

COMMENT ON VIEW public.active_job_orders_v3 IS
  'Enriched job orders with dispatch status, color coding, scope additions, and missing-info flags';

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Backfill dispatch_status from existing status column
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.job_orders
SET dispatch_status = CASE
  WHEN dispatched_at IS NOT NULL AND work_started_at IS NULL THEN 'dispatched'
  WHEN work_started_at IS NOT NULL AND work_completed_at IS NULL THEN 'on_site'
  WHEN work_completed_at IS NOT NULL THEN 'completed'
  WHEN assigned_at IS NOT NULL THEN 'scheduled'
  ELSE 'unscheduled'
END
WHERE deleted_at IS NULL;
