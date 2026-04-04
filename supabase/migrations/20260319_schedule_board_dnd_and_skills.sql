-- Add numeric skill level to profiles (1-10 scale matching job difficulty)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS skill_level_numeric INTEGER
  CHECK (skill_level_numeric IS NULL OR (skill_level_numeric >= 1 AND skill_level_numeric <= 10));

-- Add sort position for job ordering within board rows
ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS board_sort_position INTEGER DEFAULT 0;

-- Index for skill queries
CREATE INDEX IF NOT EXISTS idx_profiles_skill_level ON profiles(skill_level_numeric) WHERE skill_level_numeric IS NOT NULL;
