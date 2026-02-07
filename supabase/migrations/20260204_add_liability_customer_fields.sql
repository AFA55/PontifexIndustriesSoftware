-- Add customer name and email to liability release fields
ALTER TABLE job_orders
ADD COLUMN IF NOT EXISTS liability_release_customer_name TEXT,
ADD COLUMN IF NOT EXISTS liability_release_customer_email TEXT;

COMMENT ON COLUMN job_orders.liability_release_customer_name IS 'Customer name from liability release form';
COMMENT ON COLUMN job_orders.liability_release_customer_email IS 'Customer email from liability release form';
