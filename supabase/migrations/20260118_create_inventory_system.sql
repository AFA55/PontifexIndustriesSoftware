-- =====================================================
-- INVENTORY MANAGEMENT SYSTEM
-- =====================================================
-- This migration creates a complete inventory tracking system
-- with QR code scanning and operator assignment capabilities

-- =====================================================
-- 1. ADD INVENTORY_MANAGER ROLE
-- =====================================================

-- Drop existing role constraint and add inventory_manager
ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_role_check
CHECK (role IN ('admin', 'operator', 'inventory_manager'));

COMMENT ON COLUMN public.profiles.role IS 'User role: admin (full access), operator (field worker), inventory_manager (can scan and assign equipment)';

-- =====================================================
-- 2. CREATE INVENTORY TABLE (STOCK TRACKING)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Item identification
  name TEXT NOT NULL, -- e.g., "Husqvarna Pro Cut 3000 20"
  category TEXT NOT NULL CHECK (category IN ('blade', 'bit', 'tool', 'vehicle', 'safety', 'other')),
  manufacturer TEXT NOT NULL,
  model_number TEXT NOT NULL,
  size TEXT, -- e.g., "20" for blades, "6" for bits

  -- For what equipment (blades only)
  equipment_for TEXT CHECK (equipment_for IN ('slab_saw', 'hand_saw_flush_cut', 'wall_saw', 'chop_saw', 'core_drill')),

  -- Stock tracking
  quantity_in_stock INTEGER NOT NULL DEFAULT 0 CHECK (quantity_in_stock >= 0),
  quantity_assigned INTEGER NOT NULL DEFAULT 0 CHECK (quantity_assigned >= 0),
  reorder_level INTEGER DEFAULT 10, -- Alert when stock falls below this

  -- Financial
  unit_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  total_value DECIMAL(10,2) GENERATED ALWAYS AS (quantity_in_stock * unit_price) STORED,

  -- QR Code
  qr_code_data TEXT UNIQUE NOT NULL, -- JSON data for QR code
  qr_code_url TEXT, -- Optional: URL to QR code image in storage

  -- Metadata
  notes TEXT,
  location TEXT, -- Storage location (e.g., "Warehouse A, Shelf 3")
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),

  -- Ensure unique combination
  UNIQUE(manufacturer, model_number, size, equipment_for)
);

COMMENT ON TABLE public.inventory IS 'Inventory stock tracking - tracks quantities of items in warehouse before assignment to operators';

-- =====================================================
-- 3. MODIFY EQUIPMENT TABLE FOR ASSIGNMENT TRACKING
-- =====================================================

-- Add inventory reference to equipment table
ALTER TABLE public.equipment
ADD COLUMN IF NOT EXISTS inventory_id UUID REFERENCES public.inventory(id),
ADD COLUMN IF NOT EXISTS assigned_to_operator UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS assigned_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS is_from_inventory BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN public.equipment.inventory_id IS 'Reference to inventory item this equipment was assigned from';
COMMENT ON COLUMN public.equipment.is_from_inventory IS 'True if this equipment was assigned from inventory, false if added directly';

-- =====================================================
-- 4. CREATE INVENTORY TRANSACTIONS TABLE (AUDIT LOG)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.inventory_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id UUID REFERENCES public.inventory(id) ON DELETE CASCADE,

  -- Transaction details
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('add_stock', 'assign_to_operator', 'return_from_operator', 'adjustment', 'damage', 'loss')),
  quantity_change INTEGER NOT NULL, -- Positive for additions, negative for removals
  quantity_before INTEGER NOT NULL,
  quantity_after INTEGER NOT NULL,

  -- Assignment details (when transaction_type = 'assign_to_operator')
  operator_id UUID REFERENCES auth.users(id),
  equipment_id UUID REFERENCES public.equipment(id), -- Created equipment record
  serial_number TEXT, -- Specific serial number assigned

  -- Metadata
  notes TEXT,
  performed_by UUID REFERENCES auth.users(id),
  transaction_date TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.inventory_transactions IS 'Audit log of all inventory movements - additions, assignments, returns, etc.';

-- =====================================================
-- 5. CREATE INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_inventory_category ON public.inventory(category);
CREATE INDEX IF NOT EXISTS idx_inventory_manufacturer ON public.inventory(manufacturer);
CREATE INDEX IF NOT EXISTS idx_inventory_qr_code ON public.inventory(qr_code_data);
CREATE INDEX IF NOT EXISTS idx_inventory_low_stock ON public.inventory(quantity_in_stock) WHERE quantity_in_stock <= reorder_level;

CREATE INDEX IF NOT EXISTS idx_equipment_inventory_id ON public.equipment(inventory_id);
CREATE INDEX IF NOT EXISTS idx_equipment_assigned_to ON public.equipment(assigned_to_operator);

CREATE INDEX IF NOT EXISTS idx_transactions_inventory ON public.inventory_transactions(inventory_id);
CREATE INDEX IF NOT EXISTS idx_transactions_operator ON public.inventory_transactions(operator_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON public.inventory_transactions(transaction_date DESC);

-- =====================================================
-- 6. CREATE TRIGGERS
-- =====================================================

-- Trigger to update inventory updated_at
CREATE OR REPLACE FUNCTION update_inventory_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER inventory_updated_at
BEFORE UPDATE ON public.inventory
FOR EACH ROW
EXECUTE FUNCTION update_inventory_updated_at();

-- =====================================================
-- 7. ROW LEVEL SECURITY (RLS)
-- =====================================================

ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;

-- Inventory policies
CREATE POLICY "Everyone can view inventory"
  ON public.inventory FOR SELECT
  USING (true);

CREATE POLICY "Admins and inventory managers can manage inventory"
  ON public.inventory FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM auth.users u
      JOIN public.profiles p ON u.id = p.id
      WHERE u.id = auth.uid()
      AND p.role IN ('admin', 'inventory_manager')
    )
  );

-- Transaction policies
CREATE POLICY "Everyone can view inventory transactions"
  ON public.inventory_transactions FOR SELECT
  USING (true);

CREATE POLICY "Admins and inventory managers can create transactions"
  ON public.inventory_transactions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM auth.users u
      JOIN public.profiles p ON u.id = p.id
      WHERE u.id = auth.uid()
      AND p.role IN ('admin', 'inventory_manager')
    )
  );

-- =====================================================
-- 8. HELPER FUNCTIONS
-- =====================================================

-- Function to assign equipment from inventory
CREATE OR REPLACE FUNCTION assign_equipment_from_inventory(
  p_inventory_id UUID,
  p_operator_id UUID,
  p_serial_number TEXT,
  p_assigned_by UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_inventory RECORD;
  v_equipment_id UUID;
BEGIN
  -- Get inventory item
  SELECT * INTO v_inventory FROM public.inventory WHERE id = p_inventory_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory item not found';
  END IF;

  -- Check if stock is available
  IF v_inventory.quantity_in_stock <= 0 THEN
    RAISE EXCEPTION 'No stock available for this item';
  END IF;

  -- Create equipment record
  INSERT INTO public.equipment (
    name,
    type,
    equipment_category,
    manufacturer,
    model_number,
    size,
    equipment_for,
    serial_number,
    status,
    purchase_price,
    inventory_id,
    assigned_to_operator,
    assigned_by,
    assigned_date,
    is_from_inventory,
    is_checked_out
  ) VALUES (
    v_inventory.name,
    v_inventory.category,
    v_inventory.category,
    v_inventory.manufacturer,
    v_inventory.model_number,
    v_inventory.size,
    v_inventory.equipment_for,
    p_serial_number,
    'available',
    v_inventory.unit_price,
    p_inventory_id,
    p_operator_id,
    p_assigned_by,
    NOW(),
    true,
    true
  ) RETURNING id INTO v_equipment_id;

  -- Update inventory quantities
  UPDATE public.inventory
  SET quantity_in_stock = quantity_in_stock - 1,
      quantity_assigned = quantity_assigned + 1
  WHERE id = p_inventory_id;

  -- Create transaction record
  INSERT INTO public.inventory_transactions (
    inventory_id,
    transaction_type,
    quantity_change,
    quantity_before,
    quantity_after,
    operator_id,
    equipment_id,
    serial_number,
    notes,
    performed_by
  ) VALUES (
    p_inventory_id,
    'assign_to_operator',
    -1,
    v_inventory.quantity_in_stock,
    v_inventory.quantity_in_stock - 1,
    p_operator_id,
    v_equipment_id,
    p_serial_number,
    p_notes,
    p_assigned_by
  );

  RETURN v_equipment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION assign_equipment_from_inventory IS 'Assigns equipment from inventory to an operator - reduces stock, creates equipment record, logs transaction';

