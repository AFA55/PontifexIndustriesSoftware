-- =====================================================
-- VERIFY OPERATOR PROFILES MIGRATION
-- Run these queries to confirm everything is set up correctly
-- =====================================================

-- 1. Check that all new columns exist in profiles table
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'profiles'
AND column_name IN (
    'hourly_rate',
    'skill_level',
    'tasks_qualified_for',
    'certifications',
    'years_experience',
    'hire_date',
    'notes'
)
ORDER BY column_name;

-- Expected result: Should show 7 rows with the new columns

-- =====================================================
-- 2. Verify indexes were created
SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'profiles'
AND indexname IN (
    'idx_profiles_skill_level',
    'idx_profiles_hourly_rate',
    'idx_profiles_tasks_qualified'
)
ORDER BY indexname;

-- Expected result: Should show 3 indexes

-- =====================================================
-- 3. Check constraints
SELECT
    conname AS constraint_name,
    contype AS constraint_type,
    pg_get_constraintdef(c.oid) AS constraint_definition
FROM pg_constraint c
JOIN pg_class t ON c.conrelid = t.oid
WHERE t.relname = 'profiles'
AND conname IN (
    'hourly_rate_positive',
    'years_experience_positive'
)
ORDER BY conname;

-- Expected result: Should show 2 constraints

-- =====================================================
-- 4. View all operators (should see new columns)
SELECT
    id,
    full_name,
    email,
    role,
    hourly_rate,
    skill_level,
    tasks_qualified_for,
    certifications,
    years_experience,
    hire_date
FROM profiles
WHERE role IN ('operator', 'apprentice')
ORDER BY full_name;

-- This shows all operators with the new fields
-- Initially all new fields will be NULL or empty arrays

-- =====================================================
-- 5. Test update - Set an operator's profile (EXAMPLE)
-- Replace 'operator-uuid-here' with an actual operator ID from above query

/*
UPDATE profiles
SET
    hourly_rate = 28.50,
    skill_level = 'advanced',
    tasks_qualified_for = '["core_drilling", "slab_sawing", "wall_sawing"]'::jsonb,
    certifications = '[
        {
            "name": "OSHA 10",
            "issued_date": "2024-01-15",
            "expiry_date": "2026-01-15"
        }
    ]'::jsonb,
    years_experience = 7,
    hire_date = '2020-03-15',
    notes = 'Excellent with core drilling. Specializes in difficult cuts.'
WHERE id = 'operator-uuid-here'
AND role IN ('operator', 'apprentice');

-- Verify the update
SELECT
    full_name,
    hourly_rate,
    skill_level,
    tasks_qualified_for,
    certifications,
    years_experience,
    hire_date,
    notes
FROM profiles
WHERE id = 'operator-uuid-here';
*/

-- =====================================================
-- 6. Check operator_performance table exists
-- (This was already in your database from earlier work)
SELECT COUNT(*) as operator_count
FROM operator_performance;

-- Expected: Shows number of operators with performance records

-- =====================================================
-- 7. Sample query - Operators with hourly rate and performance
SELECT
    p.full_name,
    p.email,
    p.skill_level,
    p.hourly_rate,
    p.tasks_qualified_for,
    op.total_jobs_completed,
    op.total_revenue_generated,
    op.total_hours_worked,
    op.avg_production_rate
FROM profiles p
LEFT JOIN operator_performance op ON p.id = op.operator_id
WHERE p.role IN ('operator', 'apprentice')
ORDER BY p.full_name;

-- This is the data structure your Operator Profiles page will display

-- =====================================================
-- ✅ ALL CHECKS COMPLETE
-- If all queries ran successfully, your migration is working!
-- =====================================================
