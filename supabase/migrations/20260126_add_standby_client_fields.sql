-- Migration: Add client acknowledgment fields to standby_logs
-- Created: 2026-01-26
-- Description: Adds client representative name and signature fields for standby acknowledgment

-- Add client representative name if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'standby_logs' AND column_name = 'client_representative_name'
  ) THEN
    ALTER TABLE public.standby_logs
    ADD COLUMN client_representative_name TEXT;
  END IF;
END $$;

-- Add reason field if it doesn't exist (moved from another location)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'standby_logs' AND column_name = 'reason'
  ) THEN
    ALTER TABLE public.standby_logs
    ADD COLUMN reason TEXT;
  END IF;
END $$;

-- Add operator notes field if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'standby_logs' AND column_name = 'operator_notes'
  ) THEN
    ALTER TABLE public.standby_logs
    ADD COLUMN operator_notes TEXT;
  END IF;
END $$;

-- Create function to increment contractor standby metrics
CREATE OR REPLACE FUNCTION increment_contractor_standby(
  p_contractor_id UUID,
  p_hours DECIMAL(8,2),
  p_charges DECIMAL(10,2)
)
RETURNS VOID AS $$
BEGIN
  UPDATE public.contractors
  SET
    total_standby_hours = total_standby_hours + p_hours,
    total_standby_charges = total_standby_charges + p_charges,
    updated_at = NOW()
  WHERE id = p_contractor_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION increment_contractor_standby(UUID, DECIMAL, DECIMAL) TO authenticated;

-- Add RLS policies for standby_logs if they don't exist
DO $$
BEGIN
  -- Enable RLS
  ALTER TABLE public.standby_logs ENABLE ROW LEVEL SECURITY;

  -- Drop existing policies if they exist
  DROP POLICY IF EXISTS "Users can view their own standby logs" ON public.standby_logs;
  DROP POLICY IF EXISTS "Users can create standby logs" ON public.standby_logs;
  DROP POLICY IF EXISTS "Users can update their own standby logs" ON public.standby_logs;
  DROP POLICY IF EXISTS "Admins can view all standby logs" ON public.standby_logs;

  -- Create policies
  CREATE POLICY "Users can view their own standby logs"
    ON public.standby_logs FOR SELECT
    USING (operator_id = auth.uid());

  CREATE POLICY "Users can create standby logs"
    ON public.standby_logs FOR INSERT
    WITH CHECK (operator_id = auth.uid());

  CREATE POLICY "Users can update their own standby logs"
    ON public.standby_logs FOR UPDATE
    USING (operator_id = auth.uid());

  CREATE POLICY "Admins can view all standby logs"
    ON public.standby_logs FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
      )
    );
END $$;
