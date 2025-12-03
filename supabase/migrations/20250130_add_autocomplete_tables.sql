-- Migration: Add autocomplete suggestion tables
-- Created: 2025-01-30
-- Description: Adds tables for customer job titles, company names, and general contractors
--              to provide autocomplete suggestions in the dispatch form

-- =====================================================
-- DROP EXISTING TABLES IF THEY EXIST (for clean migration)
-- =====================================================

DROP TABLE IF EXISTS public.customer_job_titles CASCADE;
DROP TABLE IF EXISTS public.company_names CASCADE;
DROP TABLE IF EXISTS public.general_contractors CASCADE;

-- =====================================================
-- CREATE TABLES
-- =====================================================

-- Customer job titles (for autocomplete suggestions)
CREATE TABLE public.customer_job_titles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  usage_count INTEGER DEFAULT 1,
  last_used_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create unique index on lowercase title
CREATE UNIQUE INDEX idx_customer_job_titles_title_lower
  ON public.customer_job_titles(LOWER(title));

-- Company names (for autocomplete suggestions)
CREATE TABLE public.company_names (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  usage_count INTEGER DEFAULT 1,
  last_used_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create unique index on lowercase name
CREATE UNIQUE INDEX idx_company_names_name_lower
  ON public.company_names(LOWER(name));

-- General contractors (for autocomplete suggestions)
CREATE TABLE public.general_contractors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  usage_count INTEGER DEFAULT 1,
  last_used_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create unique index on lowercase name
CREATE UNIQUE INDEX idx_general_contractors_name_lower
  ON public.general_contractors(LOWER(name));

-- =====================================================
-- ENABLE ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE public.customer_job_titles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_names ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.general_contractors ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS POLICIES - CUSTOMER JOB TITLES
-- =====================================================

CREATE POLICY "All authenticated users can view customer job titles"
  ON public.customer_job_titles FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can insert customer job titles"
  ON public.customer_job_titles FOR INSERT
  WITH CHECK ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Admins can update customer job titles"
  ON public.customer_job_titles FOR UPDATE
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- =====================================================
-- RLS POLICIES - COMPANY NAMES
-- =====================================================

CREATE POLICY "All authenticated users can view company names"
  ON public.company_names FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can insert company names"
  ON public.company_names FOR INSERT
  WITH CHECK ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Admins can update company names"
  ON public.company_names FOR UPDATE
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- =====================================================
-- RLS POLICIES - GENERAL CONTRACTORS
-- =====================================================

CREATE POLICY "All authenticated users can view general contractors"
  ON public.general_contractors FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can insert general contractors"
  ON public.general_contractors FOR INSERT
  WITH CHECK ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Admins can update general contractors"
  ON public.general_contractors FOR UPDATE
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

CREATE INDEX idx_customer_job_titles_usage
  ON public.customer_job_titles(usage_count DESC, last_used_at DESC);

CREATE INDEX idx_company_names_usage
  ON public.company_names(usage_count DESC, last_used_at DESC);

CREATE INDEX idx_general_contractors_usage
  ON public.general_contractors(usage_count DESC, last_used_at DESC);

-- =====================================================
-- SEED DATA (Optional - Add some common examples)
-- =====================================================

-- Insert customer job titles
INSERT INTO public.customer_job_titles (title) VALUES
  ('PIEDMONT ATH.'),
  ('ATLANTA CONVENTION CENTER'),
  ('MIDTOWN OFFICE BUILDING'),
  ('BUCKHEAD RESIDENTIAL'),
  ('DOWNTOWN PARKING DECK');

-- Insert company names
INSERT INTO public.company_names (name) VALUES
  ('ABC Construction'),
  ('XYZ Builders'),
  ('Premier Construction Group'),
  ('Southern Concrete Services'),
  ('Metro Building Solutions');

-- Insert general contractors
INSERT INTO public.general_contractors (name) VALUES
  ('XYZ Contractors'),
  ('BuildRight Construction'),
  ('Prime General Contracting'),
  ('Southern General Contractors'),
  ('Metro GC Services');
