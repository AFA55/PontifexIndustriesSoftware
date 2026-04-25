-- Migration: operator_credentials
-- Adds compliance/credential columns to profiles for operators and apprentices.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS medical_card_expiry       DATE,
  ADD COLUMN IF NOT EXISTS drivers_license_expiry    DATE,
  ADD COLUMN IF NOT EXISTS drivers_license_class     TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS osha_10_expiry            DATE,
  ADD COLUMN IF NOT EXISTS osha_30_expiry            DATE,
  ADD COLUMN IF NOT EXISTS certifications            JSONB DEFAULT '[]'::jsonb;

-- certifications JSONB structure:
-- Array of { id: string, name: string, issued_by: string, expiry_date: string | null }
