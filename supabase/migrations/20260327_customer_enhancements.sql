-- Customer Enhancements: Add payment_method, tax_id, website, allow COD payment terms
-- These columns extend the CRM system for professional client management

-- Add new columns (idempotent — use IF NOT EXISTS pattern)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'payment_method') THEN
    ALTER TABLE customers ADD COLUMN payment_method TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'tax_id') THEN
    ALTER TABLE customers ADD COLUMN tax_id TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'website') THEN
    ALTER TABLE customers ADD COLUMN website TEXT;
  END IF;
END $$;

-- Change payment_terms from INTEGER to TEXT to support 'cod' and other string values
-- First check current type
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customers' AND column_name = 'payment_terms' AND data_type = 'integer'
  ) THEN
    ALTER TABLE customers ALTER COLUMN payment_terms TYPE TEXT USING payment_terms::TEXT;
  END IF;
END $$;

-- Add contact role 'estimating' to the customer_contacts table comment for documentation
COMMENT ON COLUMN customer_contacts.role IS 'Contact role: site_contact, project_manager, billing, owner, estimating, other';

-- Add index for payment_terms filtering
CREATE INDEX IF NOT EXISTS idx_customers_payment_terms ON customers(payment_terms);
CREATE INDEX IF NOT EXISTS idx_customers_customer_type ON customers(customer_type);
