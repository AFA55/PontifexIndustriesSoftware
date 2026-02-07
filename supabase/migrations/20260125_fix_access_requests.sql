-- Migration: Fix Access Requests Table
-- Created: 2026-01-25
-- Description: Add missing phone_number and password_plain columns

-- Add phone_number column
ALTER TABLE public.access_requests
  ADD COLUMN IF NOT EXISTS phone_number TEXT;

-- Add password_plain column (temporary storage for account creation)
ALTER TABLE public.access_requests
  ADD COLUMN IF NOT EXISTS password_plain TEXT;

-- Add comment for clarity
COMMENT ON COLUMN public.access_requests.password_plain IS 'Temporary plain password storage for account creation. Cleared after approval.';
