-- Fix RLS policies for standby_logs to allow operators to create logs
-- Created: 2026-02-01

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own standby logs" ON public.standby_logs;
DROP POLICY IF EXISTS "Users can create standby logs" ON public.standby_logs;
DROP POLICY IF EXISTS "Users can update their own standby logs" ON public.standby_logs;
DROP POLICY IF EXISTS "Admins can view all standby logs" ON public.standby_logs;

-- Enable RLS
ALTER TABLE public.standby_logs ENABLE ROW LEVEL SECURITY;

-- Allow operators to create standby logs
CREATE POLICY "Operators can create standby logs"
  ON public.standby_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (operator_id = auth.uid());

-- Allow operators to view their own standby logs
CREATE POLICY "Operators can view own standby logs"
  ON public.standby_logs
  FOR SELECT
  TO authenticated
  USING (operator_id = auth.uid());

-- Allow operators to update their own standby logs (to end them)
CREATE POLICY "Operators can update own standby logs"
  ON public.standby_logs
  FOR UPDATE
  TO authenticated
  USING (operator_id = auth.uid())
  WITH CHECK (operator_id = auth.uid());

-- Allow admins to view all standby logs
CREATE POLICY "Admins can view all standby logs"
  ON public.standby_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Allow admins to update all standby logs
CREATE POLICY "Admins can update all standby logs"
  ON public.standby_logs
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );
