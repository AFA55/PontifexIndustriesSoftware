-- =====================================================
-- ADD CONSENT TRACKING FIELDS TO ACCESS REQUESTS
-- Migration to add terms acceptance and privacy consent
-- =====================================================

-- Add consent tracking columns
ALTER TABLE public.access_requests
ADD COLUMN IF NOT EXISTS accepted_terms BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS accepted_privacy BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS consent_timestamp TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS consent_ip_address TEXT;

-- Add comment to document purpose
COMMENT ON COLUMN public.access_requests.accepted_terms IS 'User accepted Terms and Conditions';
COMMENT ON COLUMN public.access_requests.accepted_privacy IS 'User accepted Privacy Policy';
COMMENT ON COLUMN public.access_requests.consent_timestamp IS 'When user provided consent (client timestamp)';
COMMENT ON COLUMN public.access_requests.consent_ip_address IS 'IP address where consent was given';
