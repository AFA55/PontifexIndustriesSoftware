-- Clean up existing user: quantumlearnr@gmail.com
-- Run this in Supabase SQL Editor

-- Delete from profiles table
DELETE FROM profiles WHERE email = 'quantumlearnr@gmail.com';

-- Note: You also need to delete from Supabase Auth manually:
-- 1. Go to Supabase Dashboard
-- 2. Navigate to Authentication > Users
-- 3. Find quantumlearnr@gmail.com
-- 4. Click the three dots and select "Delete user"
