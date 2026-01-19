-- Check all users in profiles table
SELECT 
  id,
  full_name,
  email,
  role,
  active,
  created_at
FROM profiles
ORDER BY role, full_name;

-- Count by role
SELECT 
  role,
  COUNT(*) as count,
  COUNT(CASE WHEN active = true THEN 1 END) as active_count
FROM profiles
GROUP BY role;
