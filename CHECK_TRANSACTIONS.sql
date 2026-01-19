-- Check if there are any inventory transactions
SELECT COUNT(*) as total_transactions FROM public.inventory_transactions;

-- See all transactions
SELECT
  id,
  transaction_type,
  quantity_change,
  serial_number,
  transaction_date,
  operator_id,
  performed_by
FROM public.inventory_transactions
ORDER BY transaction_date DESC
LIMIT 20;
