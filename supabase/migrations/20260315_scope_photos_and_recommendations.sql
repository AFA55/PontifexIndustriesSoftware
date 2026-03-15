-- Migration: Add scope_photo_urls column and equipment_recommendations table
-- Date: 2025-03-15

-- ============================================================
-- 1. Add scope_photo_urls to job_orders
-- ============================================================
ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS scope_photo_urls TEXT[] DEFAULT '{}';

-- ============================================================
-- 2. Create equipment_recommendations table (smart learning)
-- ============================================================
CREATE TABLE IF NOT EXISTS equipment_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type TEXT NOT NULL,
  equipment_item TEXT NOT NULL,
  co_occurrence_count INTEGER DEFAULT 1,
  last_used_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(scope_type, equipment_item)
);

-- Index for fast lookups by scope type
CREATE INDEX IF NOT EXISTS idx_equipment_recommendations_scope
  ON equipment_recommendations(scope_type);

-- ============================================================
-- 3. Create storage buckets for scope photos and compliance docs
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('scope-photos', 'scope-photos', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('site-compliance-docs', 'site-compliance-docs', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 4. RLS policies for scope-photos bucket
-- ============================================================
CREATE POLICY "Allow authenticated uploads to scope-photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'scope-photos');

CREATE POLICY "Allow public read from scope-photos"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'scope-photos');

CREATE POLICY "Allow authenticated deletes from scope-photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'scope-photos');

-- ============================================================
-- 5. RLS policies for site-compliance-docs bucket
-- ============================================================
CREATE POLICY "Allow authenticated uploads to site-compliance-docs"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'site-compliance-docs');

CREATE POLICY "Allow public read from site-compliance-docs"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'site-compliance-docs');

CREATE POLICY "Allow authenticated deletes from site-compliance-docs"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'site-compliance-docs');

-- ============================================================
-- 6. RLS for equipment_recommendations
-- ============================================================
ALTER TABLE equipment_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read equipment_recommendations"
  ON equipment_recommendations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated insert equipment_recommendations"
  ON equipment_recommendations FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated update equipment_recommendations"
  ON equipment_recommendations FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- 7. Upsert function for smart learning (increment on conflict)
-- ============================================================
CREATE OR REPLACE FUNCTION upsert_equipment_recommendation(
  p_scope_type TEXT,
  p_equipment_item TEXT
) RETURNS void AS $$
BEGIN
  INSERT INTO equipment_recommendations (scope_type, equipment_item, co_occurrence_count, last_used_at)
  VALUES (p_scope_type, p_equipment_item, 1, NOW())
  ON CONFLICT (scope_type, equipment_item)
  DO UPDATE SET
    co_occurrence_count = equipment_recommendations.co_occurrence_count + 1,
    last_used_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
