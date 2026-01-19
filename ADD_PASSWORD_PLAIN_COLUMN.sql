-- Add password_plain column to access_requests table
-- This column temporarily stores the user's password for account creation
-- It gets cleared (set to NULL) after the account is approved for security

ALTER TABLE access_requests
ADD COLUMN IF NOT EXISTS password_plain TEXT;

-- Add comment to explain the purpose
COMMENT ON COLUMN access_requests.password_plain IS 'Temporary storage of plain text password for account creation. Cleared after approval.';

-- Optional: Update existing records to set password_plain to NULL for security
UPDATE access_requests
SET password_plain = NULL
WHERE password_plain IS NOT NULL AND status IN ('approved', 'denied');
