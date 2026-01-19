/**
 * Add Email Columns to Job Orders
 *
 * Purpose: Add customer_email and salesperson_email columns to job_orders table
 * to support automated email notifications when jobs are completed and signed.
 *
 * Features:
 * - customer_email: Email address to send Service Completion Agreement PDFs
 * - salesperson_email: Email address to notify when job is completed/signed
 *
 * Usage: Run this in Supabase SQL Editor
 */

-- Add customer_email column
ALTER TABLE job_orders
ADD COLUMN IF NOT EXISTS customer_email TEXT;

-- Add salesperson_email column
ALTER TABLE job_orders
ADD COLUMN IF NOT EXISTS salesperson_email TEXT;

-- Add email validation constraint for customer_email
ALTER TABLE job_orders
ADD CONSTRAINT customer_email_format
CHECK (customer_email IS NULL OR customer_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');

-- Add email validation constraint for salesperson_email
ALTER TABLE job_orders
ADD CONSTRAINT salesperson_email_format
CHECK (salesperson_email IS NULL OR salesperson_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');

-- Grant UPDATE permission on new columns to authenticated users
GRANT UPDATE (customer_email, salesperson_email) ON job_orders TO authenticated;

-- Add indexes for email lookups
CREATE INDEX IF NOT EXISTS idx_job_orders_customer_email
ON job_orders(customer_email) WHERE customer_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_job_orders_salesperson_email
ON job_orders(salesperson_email) WHERE salesperson_email IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN job_orders.customer_email IS 'Customer email address for sending completion agreements and notifications';
COMMENT ON COLUMN job_orders.salesperson_email IS 'Salesperson/admin email for job completion notifications';

-- Verify the changes
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'job_orders'
AND column_name IN ('customer_email', 'salesperson_email')
ORDER BY column_name;
