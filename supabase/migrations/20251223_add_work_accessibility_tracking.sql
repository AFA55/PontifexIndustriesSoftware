-- Migration: Add Work Area Accessibility Tracking
-- Created: 2025-12-23
-- Description: Adds fields to track work area accessibility for better pricing analytics

-- Add accessibility tracking fields to job_orders table
ALTER TABLE job_orders
ADD COLUMN IF NOT EXISTS work_area_accessibility_rating INTEGER CHECK (work_area_accessibility_rating >= 1 AND work_area_accessibility_rating <= 5),
ADD COLUMN IF NOT EXISTS work_area_accessibility_notes TEXT,
ADD COLUMN IF NOT EXISTS work_area_accessibility_submitted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS work_area_accessibility_submitted_by UUID REFERENCES auth.users(id);

-- Create work_items table to store detailed work performed data
CREATE TABLE IF NOT EXISTS work_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_order_id UUID REFERENCES job_orders(id) ON DELETE CASCADE NOT NULL,

  -- Work item identification
  work_type TEXT NOT NULL, -- e.g., 'CORE DRILLING', 'SLAB SAWING', etc.

  -- Core Drilling specific data
  core_size TEXT, -- e.g., '1"', '2"', '4"'
  core_depth_inches DECIMAL(5, 2),
  core_quantity INTEGER,

  -- Sawing specific data (any sawing type)
  linear_feet_cut DECIMAL(10, 2),
  cut_depth_inches DECIMAL(5, 2),

  -- Accessibility tracking (for all work types)
  accessibility_rating INTEGER CHECK (accessibility_rating >= 1 AND accessibility_rating <= 5),
  accessibility_description TEXT,

  -- General fields
  quantity DECIMAL(10, 2),
  notes TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_work_items_job_order ON work_items(job_order_id);
CREATE INDEX IF NOT EXISTS idx_work_items_work_type ON work_items(work_type);
CREATE INDEX IF NOT EXISTS idx_work_items_accessibility_rating ON work_items(accessibility_rating);
CREATE INDEX IF NOT EXISTS idx_work_items_created_at ON work_items(created_at DESC);

-- Enable RLS
ALTER TABLE work_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for work_items
-- Operators can view and insert work items for their assigned jobs
CREATE POLICY "Operators can view work items for assigned jobs"
  ON work_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM job_orders
      WHERE job_orders.id = work_items.job_order_id
      AND job_orders.assigned_to = auth.uid()
    )
  );

CREATE POLICY "Operators can insert work items for assigned jobs"
  ON work_items
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM job_orders
      WHERE job_orders.id = work_items.job_order_id
      AND job_orders.assigned_to = auth.uid()
    )
  );

CREATE POLICY "Operators can update their work items"
  ON work_items
  FOR UPDATE
  USING (created_by = auth.uid());

-- Admins can view all work items
CREATE POLICY "Admins can view all work items"
  ON work_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Admins can update all work items
CREATE POLICY "Admins can update all work items"
  ON work_items
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Create analytics view for accessibility data
CREATE OR REPLACE VIEW work_accessibility_analytics AS
SELECT
  wi.work_type,
  jo.customer_name,
  jo.location,
  AVG(wi.accessibility_rating) as avg_accessibility_rating,
  COUNT(*) as job_count,
  STRING_AGG(DISTINCT wi.accessibility_description, '; ') as common_challenges
FROM work_items wi
JOIN job_orders jo ON jo.id = wi.job_order_id
WHERE wi.accessibility_rating IS NOT NULL
GROUP BY wi.work_type, jo.customer_name, jo.location
ORDER BY avg_accessibility_rating DESC;

-- Grant permissions
GRANT SELECT ON work_items TO authenticated;
GRANT INSERT ON work_items TO authenticated;
GRANT SELECT ON work_accessibility_analytics TO authenticated;

-- Add trigger to update updated_at
CREATE OR REPLACE FUNCTION update_work_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_work_items_timestamp ON work_items;
CREATE TRIGGER trigger_update_work_items_timestamp
  BEFORE UPDATE ON work_items
  FOR EACH ROW
  EXECUTE FUNCTION update_work_items_updated_at();

-- Add comments
COMMENT ON TABLE work_items IS 'Detailed work performed data with accessibility tracking for pricing analytics';
COMMENT ON COLUMN work_items.accessibility_rating IS 'Work area accessibility rating (1=Very Difficult, 5=Very Easy)';
COMMENT ON COLUMN work_items.accessibility_description IS 'Detailed description of accessibility challenges for pricing analysis';
COMMENT ON VIEW work_accessibility_analytics IS 'Analytics view for work area accessibility by customer/location for better pricing';
