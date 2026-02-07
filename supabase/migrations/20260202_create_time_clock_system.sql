-- Create time clock system for operator attendance tracking
-- Created: 2026-02-02

-- Create time_clock table
CREATE TABLE IF NOT EXISTS public.time_clock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clock_in_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  clock_out_time TIMESTAMPTZ,
  clock_in_location JSONB, -- {lat: number, lng: number, accuracy: number}
  clock_out_location JSONB,
  total_hours DECIMAL(5,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add comments
COMMENT ON TABLE public.time_clock IS 'Tracks operator clock-in/clock-out times and locations';
COMMENT ON COLUMN public.time_clock.user_id IS 'Reference to the operator user';
COMMENT ON COLUMN public.time_clock.clock_in_time IS 'When operator clocked in';
COMMENT ON COLUMN public.time_clock.clock_out_time IS 'When operator clocked out (null if still clocked in)';
COMMENT ON COLUMN public.time_clock.clock_in_location IS 'GPS coordinates where operator clocked in';
COMMENT ON COLUMN public.time_clock.clock_out_location IS 'GPS coordinates where operator clocked out';
COMMENT ON COLUMN public.time_clock.total_hours IS 'Total hours worked (calculated on clock out)';

-- Create index for faster queries
CREATE INDEX idx_time_clock_user_id ON public.time_clock(user_id);
CREATE INDEX idx_time_clock_clock_in_time ON public.time_clock(clock_in_time DESC);
CREATE INDEX idx_time_clock_user_date ON public.time_clock(user_id, clock_in_time DESC);

-- Enable RLS
ALTER TABLE public.time_clock ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view their own time clock records
CREATE POLICY "time_clock_select_own"
  ON public.time_clock
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can insert their own time clock records (clock in)
CREATE POLICY "time_clock_insert_own"
  ON public.time_clock
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can update their own time clock records (clock out)
CREATE POLICY "time_clock_update_own"
  ON public.time_clock
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Admins can view all time clock records
CREATE POLICY "time_clock_select_admin"
  ON public.time_clock
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'admin'
    )
  );

-- Admins can update all time clock records
CREATE POLICY "time_clock_update_admin"
  ON public.time_clock
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'admin'
    )
  );

-- Function to automatically update total_hours on clock out
CREATE OR REPLACE FUNCTION calculate_total_hours()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.clock_out_time IS NOT NULL AND OLD.clock_out_time IS NULL THEN
    NEW.total_hours := EXTRACT(EPOCH FROM (NEW.clock_out_time - NEW.clock_in_time)) / 3600;
    NEW.updated_at := NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to calculate hours on clock out
CREATE TRIGGER trigger_calculate_total_hours
  BEFORE UPDATE ON public.time_clock
  FOR EACH ROW
  EXECUTE FUNCTION calculate_total_hours();
