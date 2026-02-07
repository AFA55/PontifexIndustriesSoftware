-- Create user onboarding tracking table
CREATE TABLE IF NOT EXISTS public.user_onboarding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  onboarding_type TEXT NOT NULL, -- 'admin' or 'operator'
  completed BOOLEAN DEFAULT FALSE,
  skipped BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, onboarding_type)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_onboarding_user_id ON public.user_onboarding(user_id);
CREATE INDEX IF NOT EXISTS idx_user_onboarding_type ON public.user_onboarding(onboarding_type);

-- Enable RLS
ALTER TABLE public.user_onboarding ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can read their own onboarding status
CREATE POLICY "Users can view their own onboarding status"
  ON public.user_onboarding
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can insert their own onboarding records
CREATE POLICY "Users can insert their own onboarding records"
  ON public.user_onboarding
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own onboarding records
CREATE POLICY "Users can update their own onboarding records"
  ON public.user_onboarding
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admins can view all onboarding records
CREATE POLICY "Admins can view all onboarding records"
  ON public.user_onboarding
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_user_onboarding_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER set_user_onboarding_updated_at
  BEFORE UPDATE ON public.user_onboarding
  FOR EACH ROW
  EXECUTE FUNCTION public.update_user_onboarding_updated_at();

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON public.user_onboarding TO authenticated;
GRANT USAGE ON SEQUENCE user_onboarding_id_seq TO authenticated;

COMMENT ON TABLE public.user_onboarding IS 'Tracks user onboarding completion status for admin and operator dashboards';
COMMENT ON COLUMN public.user_onboarding.onboarding_type IS 'Type of onboarding: admin or operator';
COMMENT ON COLUMN public.user_onboarding.completed IS 'Whether the user completed the onboarding tour';
COMMENT ON COLUMN public.user_onboarding.skipped IS 'Whether the user skipped the onboarding tour';
