-- Pay category config per tenant
CREATE TABLE IF NOT EXISTS pay_category_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  overtime_threshold_hours numeric NOT NULL DEFAULT 40,
  night_shift_start_hour integer NOT NULL DEFAULT 15, -- 24hr, 15 = 3pm
  night_shift_premium_rate numeric NOT NULL DEFAULT 1.15, -- multiplier
  overtime_rate numeric NOT NULL DEFAULT 1.5,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id)
);

-- Enable RLS
ALTER TABLE pay_category_config ENABLE ROW LEVEL SECURITY;

-- Admins can read/write pay config for their tenant
CREATE POLICY "pay_config_admin_select" ON pay_category_config
  FOR SELECT USING (public.is_admin() AND tenant_id = public.current_user_tenant_id());

CREATE POLICY "pay_config_admin_write" ON pay_category_config
  FOR ALL USING (public.is_admin() AND tenant_id = public.current_user_tenant_id());

-- Add pay_category to timecard_entries (new-style table)
ALTER TABLE timecard_entries
  ADD COLUMN IF NOT EXISTS pay_category text DEFAULT 'regular'
    CHECK (pay_category IN ('regular', 'night_shift', 'shop', 'overtime')),
  ADD COLUMN IF NOT EXISTS is_shop_time boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS clock_in_edited boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS clock_out_edited boolean DEFAULT false;

-- Add same columns to legacy timecards table
ALTER TABLE timecards
  ADD COLUMN IF NOT EXISTS pay_category text DEFAULT 'regular'
    CHECK (pay_category IN ('regular', 'night_shift', 'shop', 'overtime')),
  ADD COLUMN IF NOT EXISTS is_shop_time boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS clock_in_edited boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS clock_out_edited boolean DEFAULT false;

-- updated_at trigger for pay_category_config
CREATE OR REPLACE FUNCTION update_pay_category_config_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER pay_category_config_updated_at
  BEFORE UPDATE ON pay_category_config
  FOR EACH ROW EXECUTE FUNCTION update_pay_category_config_updated_at();
