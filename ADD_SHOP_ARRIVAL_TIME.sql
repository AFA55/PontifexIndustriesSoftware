-- Add shop arrival time field to job_orders table
-- This is the time operators need to arrive at the shop (before going to job site)
-- Run this in Supabase SQL Editor

-- Add shop_arrival_time column
ALTER TABLE job_orders
ADD COLUMN IF NOT EXISTS shop_arrival_time TIME;

-- Add comment for documentation
COMMENT ON COLUMN job_orders.shop_arrival_time IS 'Time operator should arrive at shop (before job arrival time)';

-- Update existing jobs to have shop arrival time (optional, set to 30 min before arrival_time)
-- UPDATE job_orders
-- SET shop_arrival_time = (arrival_time::time - INTERVAL '30 minutes')::time
-- WHERE shop_arrival_time IS NULL AND arrival_time IS NOT NULL;

-- Verify the change
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'job_orders' AND column_name = 'shop_arrival_time';

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ SUCCESS! shop_arrival_time column added to job_orders table.';
  RAISE NOTICE 'Operators will now receive both shop arrival time and job site arrival time.';
END $$;
