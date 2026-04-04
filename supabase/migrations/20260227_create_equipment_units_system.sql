-- ============================================================
-- Migration: Create Equipment Units Tracking System
-- Date: 2026-02-27
-- Description: Creates the equipment_units, unit_events,
--   maintenance_work_orders, and scheduled_maintenance tables
--   for the new NFC-enabled equipment tracking system.
--   This is SEPARATE from the legacy "equipment" table used
--   for blade/inventory management.
-- ============================================================

-- ============================================================
-- 1. equipment_units - Individual tracked equipment pieces
-- ============================================================

CREATE TABLE IF NOT EXISTS public.equipment_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Auto-generated Pontifex ID (e.g., PX-BLD-0001)
  pontifex_id TEXT UNIQUE,

  -- Basic info
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('blade', 'bit', 'tool', 'vehicle', 'safety')),
  equipment_type TEXT,
  manufacturer TEXT,
  model_number TEXT,
  manufacturer_serial TEXT,
  size TEXT,

  -- Lifecycle
  lifecycle_status TEXT NOT NULL DEFAULT 'available'
    CHECK (lifecycle_status IN (
      'available', 'active', 'new', 'in_use', 'needs_service',
      'in_maintenance', 'damaged', 'retired'
    )),

  -- Financials
  purchase_price NUMERIC(10,2),
  purchase_date DATE,

  -- Usage tracking (for blades/bits with finite life)
  estimated_life_linear_feet NUMERIC(12,2),
  linear_feet_used NUMERIC(12,2) NOT NULL DEFAULT 0,
  cost_per_foot NUMERIC(10,4) GENERATED ALWAYS AS (
    CASE
      WHEN linear_feet_used > 0 AND purchase_price IS NOT NULL
      THEN purchase_price / linear_feet_used
      ELSE NULL
    END
  ) STORED,

  -- NFC
  nfc_tag_id TEXT UNIQUE,

  -- Assignment
  current_operator_id UUID REFERENCES auth.users(id),
  assigned_at TIMESTAMPTZ,
  assigned_by UUID REFERENCES auth.users(id),

  -- Inventory link (optional, links to legacy inventory table)
  inventory_id UUID,

  -- Media
  photo_url TEXT,

  -- Notes
  notes TEXT,

  -- Retirement
  retired_at TIMESTAMPTZ,
  retired_by UUID REFERENCES auth.users(id),

  -- Audit
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_equipment_units_category ON public.equipment_units(category);
CREATE INDEX IF NOT EXISTS idx_equipment_units_lifecycle_status ON public.equipment_units(lifecycle_status);
CREATE INDEX IF NOT EXISTS idx_equipment_units_current_operator ON public.equipment_units(current_operator_id);
CREATE INDEX IF NOT EXISTS idx_equipment_units_nfc_tag ON public.equipment_units(nfc_tag_id);
CREATE INDEX IF NOT EXISTS idx_equipment_units_pontifex_id ON public.equipment_units(pontifex_id);

-- Enable RLS
ALTER TABLE public.equipment_units ENABLE ROW LEVEL SECURITY;

-- RLS: All authenticated users can view
CREATE POLICY "equipment_units_select_authenticated"
  ON public.equipment_units FOR SELECT
  TO authenticated
  USING (true);

-- RLS: Admins and shop managers can insert/update/delete
CREATE POLICY "equipment_units_insert_admin_shop"
  ON public.equipment_units FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin', 'shop_manager')
    )
  );

CREATE POLICY "equipment_units_update_admin_shop"
  ON public.equipment_units FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin', 'shop_manager')
    )
  );

CREATE POLICY "equipment_units_delete_admin"
  ON public.equipment_units FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin')
    )
  );


-- ============================================================
-- 2. Pontifex ID auto-generation trigger
-- ============================================================

CREATE OR REPLACE FUNCTION generate_pontifex_id()
RETURNS TRIGGER AS $$
DECLARE
  prefix TEXT;
  seq_num INTEGER;
  new_id TEXT;
BEGIN
  -- Determine prefix based on category
  CASE NEW.category
    WHEN 'blade' THEN prefix := 'PX-BLD-';
    WHEN 'bit' THEN prefix := 'PX-BIT-';
    WHEN 'tool' THEN prefix := 'PX-TL-';
    WHEN 'vehicle' THEN prefix := 'PX-VH-';
    WHEN 'safety' THEN prefix := 'PX-SF-';
    ELSE prefix := 'PX-EQ-';
  END CASE;

  -- Get next sequence number for this category
  SELECT COALESCE(MAX(
    CASE
      WHEN pontifex_id LIKE prefix || '%'
      THEN CAST(SUBSTRING(pontifex_id FROM LENGTH(prefix) + 1) AS INTEGER)
      ELSE 0
    END
  ), 0) + 1
  INTO seq_num
  FROM public.equipment_units
  WHERE pontifex_id LIKE prefix || '%';

  -- Format with zero-padding
  new_id := prefix || LPAD(seq_num::TEXT, 4, '0');

  NEW.pontifex_id := new_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate to avoid conflicts
DROP TRIGGER IF EXISTS trg_generate_pontifex_id ON public.equipment_units;
CREATE TRIGGER trg_generate_pontifex_id
  BEFORE INSERT ON public.equipment_units
  FOR EACH ROW
  WHEN (NEW.pontifex_id IS NULL)
  EXECUTE FUNCTION generate_pontifex_id();


-- ============================================================
-- 3. unit_events - Event log for every unit action
-- ============================================================

CREATE TABLE IF NOT EXISTS public.unit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES public.equipment_units(id) ON DELETE CASCADE,

  event_type TEXT NOT NULL CHECK (event_type IN (
    'created', 'status_changed', 'checked_out', 'checked_in',
    'usage_logged', 'maintenance_requested', 'maintenance_completed',
    'serviced', 'nfc_scanned', 'nfc_paired', 'damaged_reported',
    'notes_added', 'photo_added', 'assigned', 'unassigned'
  )),

  performed_by UUID REFERENCES auth.users(id),
  description TEXT,
  linear_feet NUMERIC(12,2),
  photo_urls TEXT[],

  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_unit_events_unit_id ON public.unit_events(unit_id);
CREATE INDEX IF NOT EXISTS idx_unit_events_event_type ON public.unit_events(event_type);
CREATE INDEX IF NOT EXISTS idx_unit_events_created_at ON public.unit_events(created_at DESC);

-- Enable RLS
ALTER TABLE public.unit_events ENABLE ROW LEVEL SECURITY;

-- RLS: All authenticated users can view events
CREATE POLICY "unit_events_select_authenticated"
  ON public.unit_events FOR SELECT
  TO authenticated
  USING (true);

-- RLS: All authenticated users can create events (API controls which types)
CREATE POLICY "unit_events_insert_authenticated"
  ON public.unit_events FOR INSERT
  TO authenticated
  WITH CHECK (true);


-- ============================================================
-- 4. maintenance_work_orders - Shop work order tracking
-- ============================================================

CREATE TABLE IF NOT EXISTS public.maintenance_work_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Linked equipment unit (optional — some WOs may be general shop tasks)
  unit_id UUID REFERENCES public.equipment_units(id),

  title TEXT NOT NULL,
  description TEXT,

  -- Status flow: pending -> assigned -> in_progress -> completed
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'assigned', 'in_progress', 'completed', 'cancelled')),

  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'critical')),

  -- Assignment
  assigned_to UUID REFERENCES auth.users(id),
  assigned_by UUID REFERENCES auth.users(id),
  assigned_at TIMESTAMPTZ,

  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  estimated_hours NUMERIC(6,2),
  actual_hours NUMERIC(6,2),

  -- Work details (filled on completion)
  issue_found TEXT,
  work_performed TEXT,
  parts_used JSONB DEFAULT '[]',    -- array of { name, quantity, unit_cost }
  parts_total_cost NUMERIC(10,2) DEFAULT 0,
  labor_cost NUMERIC(10,2) DEFAULT 0,
  total_cost NUMERIC(10,2) DEFAULT 0,

  -- Photos
  before_photos TEXT[],
  after_photos TEXT[],

  notes TEXT,

  -- Audit
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_work_orders_status ON public.maintenance_work_orders(status);
CREATE INDEX IF NOT EXISTS idx_work_orders_priority ON public.maintenance_work_orders(priority);
CREATE INDEX IF NOT EXISTS idx_work_orders_unit_id ON public.maintenance_work_orders(unit_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_assigned_to ON public.maintenance_work_orders(assigned_to);
CREATE INDEX IF NOT EXISTS idx_work_orders_created_at ON public.maintenance_work_orders(created_at DESC);

-- Enable RLS
ALTER TABLE public.maintenance_work_orders ENABLE ROW LEVEL SECURITY;

-- RLS: Shop users and admins can view
CREATE POLICY "work_orders_select_shop_admin"
  ON public.maintenance_work_orders FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin', 'shop_manager', 'shop_hand')
    )
  );

-- RLS: Shop users and admins can insert
CREATE POLICY "work_orders_insert_shop_admin"
  ON public.maintenance_work_orders FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin', 'shop_manager', 'shop_hand')
    )
  );

-- RLS: Shop users and admins can update
CREATE POLICY "work_orders_update_shop_admin"
  ON public.maintenance_work_orders FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin', 'shop_manager', 'shop_hand')
    )
  );


-- ============================================================
-- 5. scheduled_maintenance - Recurring maintenance schedules
-- ============================================================

CREATE TABLE IF NOT EXISTS public.scheduled_maintenance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Can be linked to a specific unit or apply to a category
  unit_id UUID REFERENCES public.equipment_units(id),
  category TEXT,

  name TEXT NOT NULL,
  description TEXT,

  -- Scheduling
  interval_days INTEGER,
  last_performed_at TIMESTAMPTZ,
  next_due_at TIMESTAMPTZ,

  -- Active flag
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Audit
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_maintenance_unit_id ON public.scheduled_maintenance(unit_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_maintenance_next_due ON public.scheduled_maintenance(next_due_at);
CREATE INDEX IF NOT EXISTS idx_scheduled_maintenance_active ON public.scheduled_maintenance(is_active);

-- Enable RLS
ALTER TABLE public.scheduled_maintenance ENABLE ROW LEVEL SECURITY;

-- RLS: Shop users and admins can view
CREATE POLICY "scheduled_maintenance_select_shop_admin"
  ON public.scheduled_maintenance FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin', 'shop_manager', 'shop_hand')
    )
  );

-- RLS: Shop managers and admins can manage
CREATE POLICY "scheduled_maintenance_insert_manager_admin"
  ON public.scheduled_maintenance FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin', 'shop_manager')
    )
  );

CREATE POLICY "scheduled_maintenance_update_manager_admin"
  ON public.scheduled_maintenance FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin', 'shop_manager')
    )
  );


-- ============================================================
-- 6. Update profiles role constraint to include shop roles
-- ============================================================

DO $$
BEGIN
  -- Drop existing constraint if it exists
  ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
  ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS valid_role;

  -- Add updated constraint with all roles
  ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('admin', 'super_admin', 'operator', 'apprentice', 'shop_manager', 'shop_hand', 'inventory_manager'));
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Could not update profiles role constraint: %', SQLERRM;
END $$;


-- ============================================================
-- 7. updated_at auto-update triggers
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_equipment_units_updated_at ON public.equipment_units;
CREATE TRIGGER trg_equipment_units_updated_at
  BEFORE UPDATE ON public.equipment_units
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_work_orders_updated_at ON public.maintenance_work_orders;
CREATE TRIGGER trg_work_orders_updated_at
  BEFORE UPDATE ON public.maintenance_work_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_scheduled_maintenance_updated_at ON public.scheduled_maintenance;
CREATE TRIGGER trg_scheduled_maintenance_updated_at
  BEFORE UPDATE ON public.scheduled_maintenance
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
