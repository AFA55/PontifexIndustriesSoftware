-- Backfill transaction records for existing inventory items
-- Run this in Supabase SQL Editor to create "add_stock" transactions for items that don't have them

INSERT INTO public.inventory_transactions (
  inventory_id,
  transaction_type,
  quantity_change,
  quantity_before,
  quantity_after,
  notes,
  performed_by,
  transaction_date
)
SELECT
  i.id as inventory_id,
  'add_stock' as transaction_type,
  i.quantity_in_stock + i.quantity_assigned as quantity_change,
  0 as quantity_before,
  i.quantity_in_stock + i.quantity_assigned as quantity_after,
  'Initial stock (backfilled)' as notes,
  i.created_by as performed_by,
  i.created_at as transaction_date
FROM public.inventory i
WHERE NOT EXISTS (
  SELECT 1
  FROM public.inventory_transactions t
  WHERE t.inventory_id = i.id
  AND t.transaction_type = 'add_stock'
)
AND (i.quantity_in_stock > 0 OR i.quantity_assigned > 0);

-- Check how many were added
SELECT COUNT(*) as transactions_added FROM public.inventory_transactions WHERE transaction_type = 'add_stock';
