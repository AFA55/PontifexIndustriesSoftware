-- Add phone number and email to profiles table for operator contact information
-- This will autofill silica exposure forms

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS phone_number TEXT,
ADD COLUMN IF NOT EXISTS email TEXT;

COMMENT ON COLUMN profiles.phone_number IS 'Operator phone number for autofilling silica exposure forms';
COMMENT ON COLUMN profiles.email IS 'Operator email for autofilling silica exposure forms';

-- Update demo operator with contact info
UPDATE profiles
SET
  full_name = 'Demo Operator',
  phone_number = '7777777771',
  email = 'demooperator@pontifexindustries.com'
WHERE email = 'demo@pontifex.com' OR full_name = 'Demo Operator';
