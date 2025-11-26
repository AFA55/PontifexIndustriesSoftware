-- Step 1: Create a simple function to check if user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 2: Drop ALL existing policies
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Anyone can create access request" ON public.access_requests;
DROP POLICY IF EXISTS "Admins can view all requests" ON public.access_requests;
DROP POLICY IF EXISTS "Admins can update requests" ON public.access_requests;
DROP POLICY IF EXISTS "Admins can delete requests" ON public.access_requests;

-- Step 3: Create simple policies for profiles (NO recursion)
CREATE POLICY "Enable read for all users"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Enable update for users based on id"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- Step 4: Create simple policies for access_requests using function
CREATE POLICY "Anyone can insert access request"
  ON public.access_requests FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can view all access requests"
  ON public.access_requests FOR SELECT
  TO authenticated
  USING (is_admin());

CREATE POLICY "Admins can update access requests"
  ON public.access_requests FOR UPDATE
  TO authenticated
  USING (is_admin());

CREATE POLICY "Admins can delete access requests"
  ON public.access_requests FOR DELETE
  TO authenticated
  USING (is_admin());
