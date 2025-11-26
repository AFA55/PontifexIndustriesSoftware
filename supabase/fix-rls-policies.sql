-- Drop existing policies on profiles table
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;

-- Create simple policies for profiles
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can view all active profiles"
  ON public.profiles FOR SELECT
  USING (active = true);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Drop existing policies on access_requests
DROP POLICY IF EXISTS "Admins can view all requests" ON public.access_requests;
DROP POLICY IF EXISTS "Admins can update requests" ON public.access_requests;
DROP POLICY IF EXISTS "Admins can delete requests" ON public.access_requests;

-- Create new policies for access_requests
CREATE POLICY "Admins can view all requests"
  ON public.access_requests FOR SELECT
  USING (
    auth.uid() IN (
      SELECT id FROM public.profiles WHERE role = 'admin'
    )
  );

CREATE POLICY "Admins can update requests"
  ON public.access_requests FOR UPDATE
  USING (
    auth.uid() IN (
      SELECT id FROM public.profiles WHERE role = 'admin'
    )
  );

CREATE POLICY "Admins can delete requests"
  ON public.access_requests FOR DELETE
  USING (
    auth.uid() IN (
      SELECT id FROM public.profiles WHERE role = 'admin'
    )
  );
