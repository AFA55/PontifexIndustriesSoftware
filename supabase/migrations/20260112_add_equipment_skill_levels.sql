/**
 * Migration: Add Equipment Skill Levels
 *
 * Changes:
 * - Update equipment_qualified_for to store proficiency levels (1-10) for each equipment
 * - Add certification_documents column to store PDF file URLs
 *
 * Equipment skill levels example:
 * {
 *   "mini_x": { "qualified": true, "proficiency": 8 },
 *   "brokk": { "qualified": true, "proficiency": 10 },
 *   "skid_steer": { "qualified": true, "proficiency": 6 }
 * }
 *
 * Note: equipment_qualified_for will now be an object instead of array
 * to support proficiency ratings
 */

-- Rename old column to keep backward compatibility (optional)
-- ALTER TABLE profiles RENAME COLUMN equipment_qualified_for TO equipment_qualified_for_old;

-- We'll keep the existing column and just change how we use it
-- The JSONB type is flexible enough to handle both arrays and objects

-- Add certification documents column
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS certification_documents JSONB DEFAULT '[]'::jsonb;

-- Add index for certification documents
CREATE INDEX IF NOT EXISTS idx_profiles_certification_docs ON profiles USING GIN (certification_documents);

-- Add comments
COMMENT ON COLUMN profiles.certification_documents IS 'Array of certification document URLs: [{"cert_name": "OSHA 10", "file_url": "path/to/file.pdf", "uploaded_at": "2024-01-15"}]';

-- Update equipment_qualified_for comment
COMMENT ON COLUMN profiles.equipment_qualified_for IS 'Equipment proficiency levels. Format: {"mini_x": {"qualified": true, "proficiency": 8}, "brokk": {"qualified": true, "proficiency": 10}}';

-- Grant permissions
GRANT UPDATE (certification_documents) ON profiles TO authenticated;

-- Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'profiles'
AND column_name IN ('equipment_qualified_for', 'certification_documents')
ORDER BY column_name;
