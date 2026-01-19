-- STEP 1: Only fix the constraint, nothing else
-- Run this FIRST in Supabase SQL Editor

-- Drop the old constraint
ALTER TABLE public.equipment
DROP CONSTRAINT IF EXISTS equipment_status_check;

-- Add the new constraint with 'assigned' included
ALTER TABLE public.equipment
ADD CONSTRAINT equipment_status_check
CHECK (status IN ('available', 'assigned', 'in_use', 'maintenance', 'retired'));

-- Verify it worked
SELECT 'Constraint updated successfully!' as result;
