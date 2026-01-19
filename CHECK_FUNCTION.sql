-- Step 2: Check what status value the assign_equipment_from_inventory function uses
-- Run this in Supabase SQL Editor

SELECT
  prosrc
FROM pg_proc
WHERE proname = 'assign_equipment_from_inventory';
