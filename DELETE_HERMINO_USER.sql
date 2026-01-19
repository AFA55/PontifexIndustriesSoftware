-- Force delete user quantumlearnr@gmail.com (Hermino)
-- Run this in Supabase SQL Editor

-- First, get the user ID from auth.users
-- SELECT id, email FROM auth.users WHERE email = 'quantumlearnr@gmail.com';

-- Delete from profiles table (with RLS bypass)
DELETE FROM profiles WHERE email = 'quantumlearnr@gmail.com';

-- Delete from auth.users table (this will cascade delete everything)
-- Note: You need to find the user ID from the query above and replace 'USER_ID_HERE'
-- DELETE FROM auth.users WHERE email = 'quantumlearnr@gmail.com';

-- Alternative: Use Supabase's admin function
-- You can also run this to delete the auth user:
-- SELECT auth.uid() as current_user_id;  -- Check you're running as admin
