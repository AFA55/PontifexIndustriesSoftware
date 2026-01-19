/**
 * Add Job Quote Column for Profitability Analytics
 *
 * Purpose: Add job_quote column to track quoted price for each job
 * This enables profitability calculations and revenue tracking
 *
 * Usage: Run this in Supabase SQL Editor
 */

-- Add job_quote column to job_orders table
ALTER TABLE job_orders
ADD COLUMN IF NOT EXISTS job_quote DECIMAL(10, 2);

-- Add constraint to ensure non-negative values
ALTER TABLE job_orders
ADD CONSTRAINT job_quote_non_negative
CHECK (job_quote IS NULL OR job_quote >= 0);

-- Grant UPDATE permission on new column to authenticated users
GRANT UPDATE (job_quote) ON job_orders TO authenticated;

-- Add index for profitability queries
CREATE INDEX IF NOT EXISTS idx_job_orders_job_quote
ON job_orders(job_quote) WHERE job_quote IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN job_orders.job_quote IS 'Quoted price for the job (for profitability tracking)';

-- Verify the changes
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'job_orders'
AND column_name = 'job_quote';

-- Show sample profitability calculation (once cost data is entered)
COMMENT ON COLUMN job_orders.job_quote IS 'Quoted price for the job. Used to calculate: Estimated Profit = job_quote - (labor_cost + equipment_cost + material_cost + overhead)';
