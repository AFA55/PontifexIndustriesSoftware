-- EMERGENCY FIX: Completely disable RLS on profiles table
-- This will get you unstuck so you can log in and approve users
-- We can add better policies later

-- Step 1: Drop ALL policies on profiles table
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'profiles')
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON public.profiles';
    END LOOP;
END $$;

-- Step 2: Disable RLS entirely on profiles table (temporary fix)
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;

-- Explanation:
-- This removes ALL security policies from profiles table
-- Any authenticated user can now read/write any profile
-- This is NOT secure for production, but will let you test
-- We'll add proper policies back later once login works
