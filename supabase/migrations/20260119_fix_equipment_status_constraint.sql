-- =====================================================
-- FIX EQUIPMENT STATUS CONSTRAINT
-- =====================================================
-- Add 'assigned' to the allowed equipment status values
-- This allows equipment to be marked as assigned to operators

-- Drop the existing constraint
ALTER TABLE public.equipment
DROP CONSTRAINT IF EXISTS equipment_status_check;

-- Add the updated constraint with 'assigned' status
ALTER TABLE public.equipment
ADD CONSTRAINT equipment_status_check
CHECK (status IN ('available', 'assigned', 'in_use', 'maintenance', 'retired'));

COMMENT ON COLUMN public.equipment.status IS 'Equipment status: available (ready for use), assigned (assigned to operator), in_use (currently being used), maintenance (under maintenance), retired (no longer in service)';

-- Update the assign_equipment_from_inventory function to use 'assigned' status
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

  -- Create equipment record with 'assigned' status
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
    'assigned',  -- Changed from 'available' to 'assigned'
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

COMMENT ON FUNCTION assign_equipment_from_inventory IS 'Assigns equipment from inventory to an operator - reduces stock, creates equipment record with assigned status, logs transaction';
