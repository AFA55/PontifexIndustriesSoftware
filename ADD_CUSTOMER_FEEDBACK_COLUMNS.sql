-- ============================================================================
-- ADD CUSTOMER FEEDBACK SURVEY COLUMNS
-- Adds columns to store customer ratings for operator performance
-- ============================================================================

-- Add customer feedback columns to job_orders table
ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS customer_cleanliness_rating INTEGER CHECK (customer_cleanliness_rating >= 1 AND customer_cleanliness_rating <= 10);
ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS customer_communication_rating INTEGER CHECK (customer_communication_rating >= 1 AND customer_communication_rating <= 10);
ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS customer_overall_rating INTEGER CHECK (customer_overall_rating >= 1 AND customer_overall_rating <= 10);
ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS customer_feedback_comments TEXT;

-- Grant UPDATE permission on new columns
GRANT UPDATE (
  customer_cleanliness_rating,
  customer_communication_rating,
  customer_overall_rating,
  customer_feedback_comments
) ON job_orders TO authenticated;

-- Add indexes for reporting
CREATE INDEX IF NOT EXISTS idx_job_orders_customer_ratings ON job_orders(customer_overall_rating) WHERE customer_overall_rating IS NOT NULL;

-- Verify columns were added
SELECT
  'SUCCESS! Customer feedback columns added' as status,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name = 'job_orders'
  AND column_name IN (
    'customer_cleanliness_rating',
    'customer_communication_rating',
    'customer_overall_rating',
    'customer_feedback_comments'
  );
