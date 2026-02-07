/**
 * Migration: Add Operator Profile Fields for Analytics
 *
 * Purpose: Extend profiles table with operator-specific fields for:
 * - Labor cost tracking
 * - Skill level tracking
 * - Task qualifications
 * - Certifications
 *
 * This enables:
 * - Accurate job cost calculations
 * - Smart operator assignment
 * - Performance analytics by skill level
 * - Operator analytics dashboard
 */

-- Add new columns to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS hourly_rate DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS skill_level TEXT CHECK (skill_level IN ('beginner', 'intermediate', 'advanced', 'expert', 'master')),
ADD COLUMN IF NOT EXISTS tasks_qualified_for JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS certifications JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS years_experience INTEGER,
ADD COLUMN IF NOT EXISTS hire_date DATE,
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Add constraints
ALTER TABLE profiles
ADD CONSTRAINT hourly_rate_positive CHECK (hourly_rate IS NULL OR hourly_rate > 0);

ALTER TABLE profiles
ADD CONSTRAINT years_experience_positive CHECK (years_experience IS NULL OR years_experience >= 0);

-- Add indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_profiles_skill_level ON profiles(skill_level) WHERE skill_level IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_hourly_rate ON profiles(hourly_rate) WHERE hourly_rate IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_tasks_qualified ON profiles USING GIN (tasks_qualified_for);

-- Add comments for documentation
COMMENT ON COLUMN profiles.hourly_rate IS 'True labor cost per hour for this operator (for profitability calculations)';
COMMENT ON COLUMN profiles.skill_level IS 'Overall skill level: beginner, intermediate, advanced, expert, master';
COMMENT ON COLUMN profiles.tasks_qualified_for IS 'Array of tasks operator is qualified/certified for: ["core_drilling", "slab_sawing", "wall_sawing", "hand_sawing", "demolition"]';
COMMENT ON COLUMN profiles.certifications IS 'Array of certifications: [{"name": "OSHA 10", "issued_date": "2024-01-15", "expiry_date": "2026-01-15"}]';
COMMENT ON COLUMN profiles.years_experience IS 'Total years of experience in the industry';
COMMENT ON COLUMN profiles.hire_date IS 'Date operator was hired';
COMMENT ON COLUMN profiles.notes IS 'Admin notes about operator (strengths, areas for improvement, etc.)';

-- Grant permissions
GRANT SELECT ON profiles TO authenticated;
GRANT UPDATE (hourly_rate, skill_level, tasks_qualified_for, certifications, years_experience, hire_date, notes) ON profiles TO authenticated;

-- Verify the changes
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'profiles'
AND column_name IN ('hourly_rate', 'skill_level', 'tasks_qualified_for', 'certifications', 'years_experience', 'hire_date', 'notes')
ORDER BY column_name;
