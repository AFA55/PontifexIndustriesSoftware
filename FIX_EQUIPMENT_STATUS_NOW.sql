-- =====================================================
-- QUICK FIX: Equipment Status Constraint
-- =====================================================
-- Run this in Supabase SQL Editor to fix the equipment assignment error
--
-- This adds 'assigned' to the allowed equipment status values

-- Step 1: Drop the existing constraint
ALTER TABLE public.equipment
DROP CONSTRAINT IF EXISTS equipment_status_check;

-- Step 2: Add the updated constraint with 'assigned' status
ALTER TABLE public.equipment
ADD CONSTRAINT equipment_status_check
CHECK (status IN ('available', 'assigned', 'in_use', 'maintenance', 'retired'));

-- Step 3: Update the function to use 'assigned' status
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
  SELECT * INTO v_inventory FROM public.inventory WHERE id = p_inventory_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory item not found';
  END IF;

  IF v_inventory.quantity_in_stock <= 0 THEN
    RAISE EXCEPTION 'No stock available for this item';
  END IF;

  INSERT INTO public.equipment (
    name, type, equipment_category, manufacturer, model_number, size,
    equipment_for, serial_number, status, purchase_price, inventory_id,
    assigned_to_operator, assigned_by, assigned_date, is_from_inventory, is_checked_out
  ) VALUES (
    v_inventory.name, v_inventory.category, v_inventory.category, v_inventory.manufacturer,
    v_inventory.model_number, v_inventory.size, v_inventory.equipment_for, p_serial_number,
    'assigned', v_inventory.unit_price, p_inventory_id, p_operator_id,
    p_assigned_by, NOW(), true, true
  ) RETURNING id INTO v_equipment_id;

  UPDATE public.inventory
  SET quantity_in_stock = quantity_in_stock - 1,
      quantity_assigned = quantity_assigned + 1
  WHERE id = p_inventory_id;

  INSERT INTO public.inventory_transactions (
    inventory_id, transaction_type, quantity_change, quantity_before, quantity_after,
    operator_id, equipment_id, serial_number, notes, performed_by
  ) VALUES (
    p_inventory_id, 'assign_to_operator', -1, v_inventory.quantity_in_stock,
    v_inventory.quantity_in_stock - 1, p_operator_id, v_equipment_id,
    p_serial_number, p_notes, p_assigned_by
  );

  RETURN v_equipment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Done! You can now assign equipment to operators
SELECT 'Equipment status constraint fixed! You can now assign equipment.' as message;
