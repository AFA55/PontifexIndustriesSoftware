-- Demo requests table for the request-demo funnel
-- Stores lead information from the multi-step funnel on the landing page

CREATE TABLE IF NOT EXISTS demo_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_type TEXT CHECK (company_type IN ('concrete_cutting', 'general_contractor', 'specialty_contractor', 'other')),
  team_size TEXT CHECK (team_size IN ('1-5', '6-15', '16-50', '50+')),
  biggest_challenge TEXT CHECK (biggest_challenge IN ('scheduling', 'dispatching', 'invoicing', 'all')),
  first_name TEXT NOT NULL,
  last_name TEXT,
  email TEXT NOT NULL,
  phone TEXT,
  company_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'scheduled', 'completed', 'disqualified')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for quick lookups
CREATE INDEX idx_demo_requests_email ON demo_requests (email);
CREATE INDEX idx_demo_requests_status ON demo_requests (status);
CREATE INDEX idx_demo_requests_created ON demo_requests (created_at DESC);

-- Enable RLS
ALTER TABLE demo_requests ENABLE ROW LEVEL SECURITY;

-- Policy: only super_admin and admin can read demo requests
CREATE POLICY "Admins can view demo requests"
  ON demo_requests FOR SELECT
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('super_admin', 'admin', 'operations_manager')
  );

-- Policy: anonymous inserts allowed (public funnel)
CREATE POLICY "Anyone can submit demo requests"
  ON demo_requests FOR INSERT
  WITH CHECK (true);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_demo_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER demo_requests_updated_at
  BEFORE UPDATE ON demo_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_demo_requests_updated_at();

-- Add comment
COMMENT ON TABLE demo_requests IS 'Leads from the request-demo funnel on the landing page';
