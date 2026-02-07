-- Add departure_time column to job_orders table
-- This stores the operator's self-reported departure time from the shop

ALTER TABLE job_orders
ADD COLUMN IF NOT EXISTS departure_time TEXT;

COMMENT ON COLUMN job_orders.departure_time IS 'Operator-reported departure time from shop in 12-hour format (e.g., 4:53 PM)';
