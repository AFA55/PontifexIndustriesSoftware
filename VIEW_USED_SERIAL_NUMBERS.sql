-- View all serial numbers currently in use
-- Run this in Supabase SQL Editor to see what serial numbers are taken

SELECT
  serial_number,
  name as equipment_name,
  type,
  manufacturer,
  model_number,
  status,
  assigned_to_operator,
  assigned_date,
  created_at
FROM public.equipment
ORDER BY created_at DESC;

-- If you want to see just the serial numbers:
-- SELECT serial_number FROM public.equipment ORDER BY serial_number;
