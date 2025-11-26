-- =====================================================
-- ACCESS REQUESTS TABLE
-- For managing user access requests and approvals
-- =====================================================

CREATE TABLE public.access_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Request Info
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL, -- Stored securely (we'll hash before saving)
  date_of_birth DATE NOT NULL,
  position TEXT NOT NULL, -- Job position/title

  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),

  -- Admin Actions
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,
  assigned_role TEXT CHECK (assigned_role IN ('admin', 'operator')),
  denial_reason TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX idx_access_requests_status ON public.access_requests(status);
CREATE INDEX idx_access_requests_email ON public.access_requests(email);
CREATE INDEX idx_access_requests_created_at ON public.access_requests(created_at DESC);

-- RLS Policies
ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;

-- Anyone can create a request (no auth required)
CREATE POLICY "Anyone can create access request"
  ON public.access_requests FOR INSERT
  WITH CHECK (true);

-- Admins can view all requests
CREATE POLICY "Admins can view all requests"
  ON public.access_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admins can update requests (approve/deny)
CREATE POLICY "Admins can update requests"
  ON public.access_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admins can delete requests
CREATE POLICY "Admins can delete requests"
  ON public.access_requests FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Auto-update timestamp trigger
CREATE TRIGGER trigger_update_access_requests_updated_at
  BEFORE UPDATE ON public.access_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
