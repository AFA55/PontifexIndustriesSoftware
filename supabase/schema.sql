-- =====================================================
-- PONTIFEX INDUSTRIES - SUPABASE DATABASE SCHEMA
-- Complete schema for dispatch, equipment, and analytics
-- =====================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- 1. USERS & AUTHENTICATION
-- =====================================================

-- Custom user profiles (extends Supabase auth.users)
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'operator')),
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  active BOOLEAN DEFAULT true
);

-- =====================================================
-- 2. EQUIPMENT MANAGEMENT
-- =====================================================

CREATE TABLE public.equipment (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('tool', 'blade', 'vehicle', 'safety', 'other')),
  brand TEXT,
  model TEXT,
  serial_number TEXT UNIQUE NOT NULL,
  qr_code TEXT UNIQUE, -- QR code identifier
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'in_use', 'maintenance', 'retired')),

  -- Assignment
  assigned_to UUID REFERENCES public.profiles(id),
  assigned_at TIMESTAMPTZ,

  -- Location & Details
  location TEXT,
  purchase_date DATE,
  purchase_cost DECIMAL(10,2),

  -- Usage tracking
  total_usage_hours DECIMAL(10,2) DEFAULT 0,
  last_used_at TIMESTAMPTZ,

  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Equipment usage log (for analytics)
CREATE TABLE public.equipment_usage_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  equipment_id UUID REFERENCES public.equipment(id) NOT NULL,
  job_id UUID, -- Will reference jobs table
  operator_id UUID REFERENCES public.profiles(id),
  hours_used DECIMAL(10,2),
  date_used DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 3. JOBS/DISPATCH TICKETS
-- =====================================================

CREATE TABLE public.jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_number TEXT UNIQUE NOT NULL, -- Auto-generated: JOB-2024-001

  -- Basic Info
  title TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  project_name TEXT,

  -- Location
  location TEXT NOT NULL,
  address TEXT,

  -- Scheduling
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_route', 'in_progress', 'completed', 'cancelled')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  scheduled_start_date DATE NOT NULL,
  scheduled_end_date DATE,
  scheduled_arrival_time TIME,
  estimated_hours DECIMAL(10,2),

  -- Actual times (filled when job progresses)
  actual_start_time TIMESTAMPTZ,
  actual_end_time TIMESTAMPTZ,
  actual_hours_worked DECIMAL(10,2),

  -- Assignment
  assigned_operators UUID[], -- Array of operator IDs
  salesman TEXT,

  -- Job Details
  job_types TEXT[], -- Array: ['CORE DRILLING', 'WALL CUTTING']
  description TEXT,
  additional_info TEXT,

  -- Job Site Info
  contact_on_site TEXT,
  contact_phone TEXT,
  job_site_number TEXT,
  po_number TEXT,
  customer_job_number TEXT,

  -- Financial (Admin Only)
  job_quote DECIMAL(10,2),
  total_revenue DECIMAL(10,2),
  labor_cost DECIMAL(10,2),
  material_cost DECIMAL(10,2),
  equipment_cost DECIMAL(10,2),

  -- Production Metrics
  linear_feet_cut DECIMAL(10,2),
  square_feet_completed DECIMAL(10,2),
  holes_drilled INTEGER,

  -- Required Documents
  required_documents TEXT[], -- Array of document names

  -- Equipment Assigned
  equipment_assigned UUID[], -- Array of equipment IDs

  -- Progress
  progress_percentage INTEGER DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100),

  -- Photos/Files
  photo_urls TEXT[],
  document_urls TEXT[],

  -- Notes & Updates
  notes TEXT,
  completion_notes TEXT,

  -- Metadata
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Job type specific details (flexible JSON storage)
CREATE TABLE public.job_type_details (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID REFERENCES public.jobs(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL,
  details JSONB NOT NULL, -- Flexible storage for type-specific data
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Job status history (audit trail)
CREATE TABLE public.job_status_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID REFERENCES public.jobs(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_by UUID REFERENCES public.profiles(id),
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT
);

-- Job updates/timeline (operator logs)
CREATE TABLE public.job_updates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID REFERENCES public.jobs(id) ON DELETE CASCADE,
  update_type TEXT NOT NULL CHECK (update_type IN ('status_change', 'note', 'photo', 'measurement', 'issue', 'completion')),
  content TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB -- For flexible data like photo URLs, measurements, etc.
);

-- =====================================================
-- 4. BLADES & BITS TRACKING
-- =====================================================

CREATE TABLE public.blades (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type TEXT NOT NULL CHECK (type IN ('wall_saw', 'hand_saw', 'slab_saw', 'chainsaw', 'core_bit')),
  brand_name TEXT NOT NULL,
  size TEXT NOT NULL,
  serial_number TEXT UNIQUE NOT NULL,
  purchase_date DATE NOT NULL,
  purchase_cost DECIMAL(10,2),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),

  -- Usage Tracking
  total_linear_feet DECIMAL(10,2) DEFAULT 0, -- For saws
  total_inches DECIMAL(10,2) DEFAULT 0, -- For core bits and chainsaws
  holes_count INTEGER DEFAULT 0, -- For core bits

  -- Assignment
  assigned_to UUID REFERENCES public.profiles(id),

  -- Retirement
  retired_at TIMESTAMPTZ,
  retirement_reason TEXT,
  retirement_photo_url TEXT,

  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Blade usage log
CREATE TABLE public.blade_usage_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  blade_id UUID REFERENCES public.blades(id) NOT NULL,
  job_id UUID REFERENCES public.jobs(id),
  operator_id UUID REFERENCES public.profiles(id),
  linear_feet DECIMAL(10,2),
  inches DECIMAL(10,2),
  holes INTEGER,
  date_used DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 5. ANALYTICS & AGGREGATIONS
-- =====================================================

-- Daily aggregations (updated by cron job)
CREATE TABLE public.analytics_daily (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE UNIQUE NOT NULL,

  -- Jobs
  jobs_completed INTEGER DEFAULT 0,
  jobs_in_progress INTEGER DEFAULT 0,
  jobs_scheduled INTEGER DEFAULT 0,

  -- Financial
  total_revenue DECIMAL(10,2) DEFAULT 0,
  total_labor_cost DECIMAL(10,2) DEFAULT 0,
  total_material_cost DECIMAL(10,2) DEFAULT 0,
  total_equipment_cost DECIMAL(10,2) DEFAULT 0,
  gross_profit DECIMAL(10,2) DEFAULT 0,
  profit_margin DECIMAL(5,2) DEFAULT 0,

  -- Production
  total_linear_feet DECIMAL(10,2) DEFAULT 0,
  total_hours_worked DECIMAL(10,2) DEFAULT 0,
  avg_production_rate DECIMAL(10,2) DEFAULT 0, -- feet per hour

  -- Equipment
  equipment_in_use INTEGER DEFAULT 0,
  equipment_available INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Operator performance (updated daily)
CREATE TABLE public.operator_performance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  operator_id UUID REFERENCES public.profiles(id) UNIQUE NOT NULL,

  -- All-time stats
  total_jobs_completed INTEGER DEFAULT 0,
  total_revenue_generated DECIMAL(10,2) DEFAULT 0,
  total_hours_worked DECIMAL(10,2) DEFAULT 0,
  total_linear_feet DECIMAL(10,2) DEFAULT 0,

  -- Calculated metrics
  avg_production_rate DECIMAL(10,2) DEFAULT 0, -- feet per hour
  revenue_per_hour DECIMAL(10,2) DEFAULT 0,
  on_time_completion_rate DECIMAL(5,2) DEFAULT 0,

  -- Last 30 days
  jobs_completed_30d INTEGER DEFAULT 0,
  revenue_30d DECIMAL(10,2) DEFAULT 0,

  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 6. DOCUMENTS & SAFETY FORMS
-- =====================================================

CREATE TABLE public.required_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID REFERENCES public.jobs(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  completed BOOLEAN DEFAULT false,
  completed_by UUID REFERENCES public.profiles(id),
  completed_at TIMESTAMPTZ,
  file_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 7. NOTIFICATIONS & ALERTS
-- =====================================================

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id),
  type TEXT NOT NULL CHECK (type IN ('job_assigned', 'job_completed', 'equipment_issue', 'reminder', 'alert')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT false,
  job_id UUID REFERENCES public.jobs(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Profiles
CREATE INDEX idx_profiles_role ON public.profiles(role);
CREATE INDEX idx_profiles_email ON public.profiles(email);

-- Jobs
CREATE INDEX idx_jobs_status ON public.jobs(status);
CREATE INDEX idx_jobs_assigned_operators ON public.jobs USING GIN(assigned_operators);
CREATE INDEX idx_jobs_scheduled_start ON public.jobs(scheduled_start_date);
CREATE INDEX idx_jobs_created_at ON public.jobs(created_at);

-- Equipment
CREATE INDEX idx_equipment_status ON public.equipment(status);
CREATE INDEX idx_equipment_assigned_to ON public.equipment(assigned_to);
CREATE INDEX idx_equipment_qr_code ON public.equipment(qr_code);

-- Blades
CREATE INDEX idx_blades_status ON public.blades(status);
CREATE INDEX idx_blades_assigned_to ON public.blades(assigned_to);

-- Analytics
CREATE INDEX idx_analytics_daily_date ON public.analytics_daily(date);
CREATE INDEX idx_operator_performance_operator_id ON public.operator_performance(operator_id);

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_usage_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_type_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blade_usage_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operator_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.required_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- PROFILES POLICIES
-- =====================================================

-- Users can view their own profile
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- Admins can view all profiles
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admins can insert/update/delete profiles
CREATE POLICY "Admins can manage profiles"
  ON public.profiles FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- =====================================================
-- EQUIPMENT POLICIES
-- =====================================================

-- Everyone can view equipment
CREATE POLICY "Everyone can view equipment"
  ON public.equipment FOR SELECT
  USING (true);

-- Admins can manage equipment
CREATE POLICY "Admins can manage equipment"
  ON public.equipment FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- =====================================================
-- JOBS POLICIES
-- =====================================================

-- Operators can view their assigned jobs
CREATE POLICY "Operators can view assigned jobs"
  ON public.jobs FOR SELECT
  USING (
    auth.uid() = ANY(assigned_operators) OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admins can manage all jobs
CREATE POLICY "Admins can manage jobs"
  ON public.jobs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Operators can update their assigned jobs
CREATE POLICY "Operators can update assigned jobs"
  ON public.jobs FOR UPDATE
  USING (auth.uid() = ANY(assigned_operators));

-- =====================================================
-- ANALYTICS POLICIES (Admin only)
-- =====================================================

CREATE POLICY "Admins can view analytics"
  ON public.analytics_daily FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can view operator performance"
  ON public.operator_performance FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Operators can view their own performance
CREATE POLICY "Operators can view own performance"
  ON public.operator_performance FOR SELECT
  USING (operator_id = auth.uid());

-- =====================================================
-- NOTIFICATIONS POLICIES
-- =====================================================

CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  USING (user_id = auth.uid());

-- =====================================================
-- FUNCTIONS & TRIGGERS
-- =====================================================

-- Auto-generate job numbers
CREATE OR REPLACE FUNCTION generate_job_number()
RETURNS TEXT AS $$
DECLARE
  year TEXT;
  count INT;
  job_num TEXT;
BEGIN
  year := TO_CHAR(NOW(), 'YYYY');

  SELECT COUNT(*) + 1 INTO count
  FROM public.jobs
  WHERE job_number LIKE 'JOB-' || year || '-%';

  job_num := 'JOB-' || year || '-' || LPAD(count::TEXT, 3, '0');
  RETURN job_num;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate job number
CREATE OR REPLACE FUNCTION set_job_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.job_number IS NULL OR NEW.job_number = '' THEN
    NEW.job_number := generate_job_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_job_number
  BEFORE INSERT ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION set_job_number();

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_update_equipment_updated_at
  BEFORE UPDATE ON public.equipment
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_update_jobs_updated_at
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_update_blades_updated_at
  BEFORE UPDATE ON public.blades
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Calculate actual hours when job completes
CREATE OR REPLACE FUNCTION calculate_job_hours()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND NEW.actual_start_time IS NOT NULL AND NEW.actual_end_time IS NOT NULL THEN
    NEW.actual_hours_worked := EXTRACT(EPOCH FROM (NEW.actual_end_time - NEW.actual_start_time)) / 3600;
    NEW.completed_at := NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_job_hours
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION calculate_job_hours();

-- =====================================================
-- SEED DATA FOR TESTING
-- =====================================================

-- Note: Run this AFTER creating your first admin user through Supabase Auth
-- Then update the UUID below with your actual user ID

-- Example admin user profile (replace UUID with actual auth.users ID)
-- INSERT INTO public.profiles (id, email, full_name, role, phone)
-- VALUES
--   ('your-auth-user-id-here', 'admin@pontifex.com', 'Admin User', 'admin', '555-0001');

-- Example operator profiles
-- INSERT INTO public.profiles (id, email, full_name, role, phone)
-- VALUES
--   (uuid_generate_v4(), 'andres@pontifex.com', 'ANDRES GUERRERO-C', 'operator', '555-0101'),
--   (uuid_generate_v4(), 'carlos@pontifex.com', 'CARLOS MARTINEZ', 'operator', '555-0102');

-- =====================================================
-- STORAGE BUCKETS (Run in Supabase Dashboard -> Storage)
-- =====================================================

-- Create storage buckets:
-- 1. job-photos (for job site photos)
-- 2. equipment-photos (for equipment images)
-- 3. documents (for PDFs, forms)
-- 4. blade-retirement-photos (for blade retirement documentation)

-- =====================================================
-- CRON JOBS (Enable pg_cron extension first)
-- =====================================================

-- Daily analytics aggregation (runs at 11:59 PM every day)
/*
SELECT cron.schedule(
  'aggregate-daily-analytics',
  '59 23 * * *',
  $$
  INSERT INTO public.analytics_daily (
    date,
    jobs_completed,
    total_revenue,
    total_labor_cost,
    total_material_cost,
    total_equipment_cost,
    gross_profit,
    total_linear_feet,
    total_hours_worked
  )
  SELECT
    CURRENT_DATE,
    COUNT(*) FILTER (WHERE status = 'completed' AND DATE(completed_at) = CURRENT_DATE),
    COALESCE(SUM(total_revenue), 0),
    COALESCE(SUM(labor_cost), 0),
    COALESCE(SUM(material_cost), 0),
    COALESCE(SUM(equipment_cost), 0),
    COALESCE(SUM(total_revenue - COALESCE(labor_cost, 0) - COALESCE(material_cost, 0) - COALESCE(equipment_cost, 0)), 0),
    COALESCE(SUM(linear_feet_cut), 0),
    COALESCE(SUM(actual_hours_worked), 0)
  FROM public.jobs
  WHERE DATE(completed_at) = CURRENT_DATE
  ON CONFLICT (date) DO UPDATE
  SET
    jobs_completed = EXCLUDED.jobs_completed,
    total_revenue = EXCLUDED.total_revenue,
    updated_at = NOW();
  $$
);
*/
