-- Step 1: Check what the current equipment_status_check constraint actually allows
-- Run this in Supabase SQL Editor to see the exact constraint

SELECT
  conname AS constraint_name,
  pg_get_constraintdef(c.oid) AS constraint_definition
FROM pg_constraint c
JOIN pg_namespace n ON n.oid = c.connamespace
JOIN pg_class cl ON cl.oid = c.conrelid
WHERE
  contype = 'c'
  AND conname = 'equipment_status_check'
  AND cl.relname = 'equipment';
