-- Fix Standby Logs RLS Policies
-- Ensure standby_logs table has proper RLS policies without recursion issues

-- Drop any existing standby_logs policies
DROP POLICY IF EXISTS "Users can view own standby logs" ON standby_logs;
DROP POLICY IF EXISTS "Users can insert own standby logs" ON standby_logs;
DROP POLICY IF EXISTS "Users can update own standby logs" ON standby_logs;
DROP POLICY IF EXISTS "Admins can view all standby logs" ON standby_logs;
DROP POLICY IF EXISTS "Admins can manage all standby logs" ON standby_logs;

-- Create clean policies for standby_logs
-- Policy 1: Operators can view their own standby logs
CREATE POLICY "Users can view own standby logs"
ON standby_logs
FOR SELECT
USING (auth.uid() = operator_id);

-- Policy 2: Operators can insert their own standby logs
CREATE POLICY "Users can insert own standby logs"
ON standby_logs
FOR INSERT
WITH CHECK (auth.uid() = operator_id);

-- Policy 3: Operators can update their own standby logs (to end standby)
CREATE POLICY "Users can update own standby logs"
ON standby_logs
FOR UPDATE
USING (auth.uid() = operator_id)
WITH CHECK (auth.uid() = operator_id);

-- Policy 4: Admins can view all standby logs
CREATE POLICY "Admins can view all standby logs"
ON standby_logs
FOR SELECT
USING (
  auth.uid() IN (
    SELECT id FROM auth.users
    WHERE raw_user_meta_data->>'role' = 'admin'
  )
);

-- Policy 5: Admins can manage all standby logs
CREATE POLICY "Admins can manage all standby logs"
ON standby_logs
FOR ALL
USING (
  auth.uid() IN (
    SELECT id FROM auth.users
    WHERE raw_user_meta_data->>'role' = 'admin'
  )
)
WITH CHECK (
  auth.uid() IN (
    SELECT id FROM auth.users
    WHERE raw_user_meta_data->>'role' = 'admin'
  )
);

-- Ensure RLS is enabled
ALTER TABLE standby_logs ENABLE ROW LEVEL SECURITY;
