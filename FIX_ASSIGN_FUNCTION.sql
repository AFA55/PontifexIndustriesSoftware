-- Fix the assign_equipment_from_inventory function to use 'available' status
-- Run this in Supabase SQL Editor

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

  -- Create equipment record with 'available' status
  -- (assignment is tracked via assigned_to_operator, not status)
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
    'available', -- FIXED: Changed from 'assigned' to 'available'
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
    v_inventory.quantity_in_stock,
    v_inventory.quantity_in_stock - 1,
    p_operator_id,
    v_equipment_id,
    p_serial_number,
    COALESCE(p_notes, 'Assigned from inventory to operator'),
    p_assigned_by
  );

  RETURN v_equipment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION assign_equipment_from_inventory TO authenticated;

SELECT 'Function updated successfully! Status changed from assigned to available.' as message;
