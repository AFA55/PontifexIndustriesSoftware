-- Dashboard layouts — stores per-user widget layout configurations
CREATE TABLE IF NOT EXISTS public.dashboard_layouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) UNIQUE,
  layout JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.dashboard_layouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own layout" ON public.dashboard_layouts
  FOR ALL USING (user_id = auth.uid());

-- Commission rate on profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS commission_rate DECIMAL(5,4) DEFAULT 0.0000;

-- Updated_at trigger for dashboard_layouts
CREATE OR REPLACE FUNCTION update_dashboard_layouts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_dashboard_layouts_updated_at
  BEFORE UPDATE ON dashboard_layouts
  FOR EACH ROW
  EXECUTE FUNCTION update_dashboard_layouts_updated_at();
