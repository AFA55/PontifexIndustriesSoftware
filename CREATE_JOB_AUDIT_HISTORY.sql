-- Job Orders Audit/History Tracking System
-- This table stores a complete history of all changes made to job orders
-- For documentation, compliance, and audit purposes

-- Create the audit history table
CREATE TABLE IF NOT EXISTS job_orders_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Reference to the job order
  job_order_id UUID NOT NULL REFERENCES job_orders(id) ON DELETE CASCADE,
  job_number TEXT NOT NULL,

  -- Change metadata
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_by_name TEXT, -- Store name for reference even if user is deleted
  changed_by_role TEXT, -- admin, operator, etc.

  -- Change details
  change_type TEXT NOT NULL CHECK (change_type IN ('created', 'updated', 'status_changed', 'assigned', 'deleted')),

  -- What fields changed (JSON object with field names as keys)
  changes JSONB NOT NULL,
  -- Example: {"arrival_time": {"old": "07:00", "new": "08:00"}, "location": {"old": "Site A", "new": "Site B"}}

  -- Optional: store full snapshot of the job order at this point in time
  snapshot JSONB,

  -- Additional context
  notes TEXT, -- Optional notes about why the change was made
  ip_address TEXT, -- Track IP for security
  user_agent TEXT, -- Track browser/device

  -- Indexing
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_job_orders_history_job_order_id ON job_orders_history(job_order_id);
CREATE INDEX IF NOT EXISTS idx_job_orders_history_changed_at ON job_orders_history(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_orders_history_changed_by ON job_orders_history(changed_by);
CREATE INDEX IF NOT EXISTS idx_job_orders_history_change_type ON job_orders_history(change_type);

-- Add comment for documentation
COMMENT ON TABLE job_orders_history IS 'Audit trail tracking all changes made to job orders for documentation and compliance';
COMMENT ON COLUMN job_orders_history.changes IS 'JSON object containing old and new values for each changed field';
COMMENT ON COLUMN job_orders_history.snapshot IS 'Complete snapshot of the job order at the time of change';

-- Enable Row Level Security
ALTER TABLE job_orders_history ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can view all history
CREATE POLICY "Admins can view all job order history"
  ON job_orders_history
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Policy: Operators can view history for their assigned jobs
CREATE POLICY "Operators can view history for assigned jobs"
  ON job_orders_history
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM job_orders
      WHERE job_orders.id = job_orders_history.job_order_id
      AND job_orders.assigned_to = auth.uid()
    )
  );

-- Policy: Only system can insert history (via API)
CREATE POLICY "System can insert job order history"
  ON job_orders_history
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create a helpful view for human-readable history
CREATE OR REPLACE VIEW job_orders_history_readable AS
SELECT
  h.id,
  h.job_order_id,
  h.job_number,
  h.changed_at,
  h.changed_by_name,
  h.changed_by_role,
  h.change_type,
  h.changes,
  h.notes,
  -- Format the changes into a readable summary
  (
    SELECT string_agg(
      key || ': "' || COALESCE((value->>'old')::text, 'null') || '" → "' || COALESCE((value->>'new')::text, 'null') || '"',
      ', '
    )
    FROM jsonb_each(h.changes)
  ) as change_summary
FROM job_orders_history h
ORDER BY h.changed_at DESC;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ SUCCESS! Job orders audit history system created.';
  RAISE NOTICE '📝 All changes to job orders will now be tracked for documentation.';
  RAISE NOTICE '🔍 Use the job_orders_history table to view change history.';
  RAISE NOTICE '👁️ Use the job_orders_history_readable view for human-readable summaries.';
END $$;
