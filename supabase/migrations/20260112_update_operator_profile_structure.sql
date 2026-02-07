/**
 * Migration: Update Operator Profile Structure
 *
 * Changes:
 * 1. Remove overall skill_level (too generic)
 * 2. Add skill_levels JSONB - per-task skill levels
 * 3. Add equipment_qualified_for JSONB - equipment certifications
 *
 * Skill levels per task example:
 * {
 *   "core_drilling": { "level": "expert", "proficiency": 5 },
 *   "slab_sawing": { "level": "advanced", "proficiency": 4 },
 *   "wall_sawing": { "level": "intermediate", "proficiency": 3 }
 * }
 *
 * Equipment qualified example:
 * ["mini_x", "brokk", "skid_steer", "sherpa", "forklift", "scissorlift", "lull"]
 */

-- Remove old skill_level column (if you want to keep it for reference, skip this)
-- ALTER TABLE profiles DROP COLUMN IF EXISTS skill_level;

-- Add new columns
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS skill_levels JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS equipment_qualified_for JSONB DEFAULT '[]'::jsonb;

-- Add index for skill_levels queries
CREATE INDEX IF NOT EXISTS idx_profiles_skill_levels ON profiles USING GIN (skill_levels);
CREATE INDEX IF NOT EXISTS idx_profiles_equipment_qualified ON profiles USING GIN (equipment_qualified_for);

-- Add comments
COMMENT ON COLUMN profiles.skill_levels IS 'Skill levels per task type. Format: {"core_drilling": {"level": "expert", "proficiency": 5}, "slab_sawing": {"level": "advanced", "proficiency": 4}}';
COMMENT ON COLUMN profiles.equipment_qualified_for IS 'Array of equipment operator is qualified to use: ["mini_x", "brokk", "skid_steer", "sherpa", "forklift", "scissorlift", "lull"]';

-- Grant permissions
GRANT UPDATE (skill_levels, equipment_qualified_for) ON profiles TO authenticated;

-- Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'profiles'
AND column_name IN ('skill_levels', 'equipment_qualified_for')
ORDER BY column_name;
