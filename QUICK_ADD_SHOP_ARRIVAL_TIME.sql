-- Quick fix: Add shop_arrival_time column to job_orders table
-- Copy this and run it in Supabase SQL Editor

ALTER TABLE job_orders
ADD COLUMN IF NOT EXISTS shop_arrival_time TIME;

COMMENT ON COLUMN job_orders.shop_arrival_time IS 'Time operator should arrive at shop (before job arrival time)';

-- Verify it worked
SELECT 'SUCCESS! Column added.' as status;
