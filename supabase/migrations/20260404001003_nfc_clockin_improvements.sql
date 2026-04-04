-- ============================================================
-- Migration: NFC clock-in improvements
-- Date: 2026-04-04
-- ============================================================
-- 1. Add nfc_tag_serial (physical chip hardware serial)
-- 2. Expand clock_in_method to allow 'gps_remote' and 'pin'
-- 3. Add requires_approval flag for remote GPS clock-ins
-- 4. Add approval_note for admin feedback
-- 5. Create shop_daily_pins table for PIN-based on-site verification
-- ============================================================

-- Add nfc_tag_serial — the hardware serial number reported by the physical NFC chip
-- (distinct from nfc_tag_uid which may be an NDEF text record written to the chip)
ALTER TABLE timecards ADD COLUMN IF NOT EXISTS nfc_tag_serial text;

-- requires_approval: set to true for gps_remote clock-ins; admin must review
ALTER TABLE timecards ADD COLUMN IF NOT EXISTS requires_approval boolean NOT NULL DEFAULT false;

-- approval_note: admin can leave a note when approving/rejecting
ALTER TABLE timecards ADD COLUMN IF NOT EXISTS approval_note text;

-- Ensure clock_in_method and clock_out_method columns exist (idempotent)
ALTER TABLE timecards ADD COLUMN IF NOT EXISTS clock_in_method text DEFAULT 'manual';
ALTER TABLE timecards ADD COLUMN IF NOT EXISTS clock_out_method text DEFAULT 'manual';

-- Index for fast lookup of pending remote approvals
CREATE INDEX IF NOT EXISTS idx_timecards_requires_approval
  ON timecards (tenant_id, requires_approval, remote_verified)
  WHERE requires_approval = true;

-- Index on clock_in_method for admin filter queries
CREATE INDEX IF NOT EXISTS idx_timecards_clock_in_method
  ON timecards (tenant_id, clock_in_method);

-- ── Shop Daily PINs ──────────────────────────────────────────────────
-- Admin sets a 4-6 digit daily PIN; operators enter it to prove on-site presence
-- when NFC is not available (iOS, old Android, etc.)

CREATE TABLE IF NOT EXISTS shop_daily_pins (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid REFERENCES tenants(id) ON DELETE CASCADE,
  pin_code    text NOT NULL CHECK (length(pin_code) BETWEEN 4 AND 8),
  valid_date  date NOT NULL DEFAULT CURRENT_DATE,
  created_by  uuid REFERENCES profiles(id),
  created_at  timestamptz DEFAULT now(),
  expires_at  timestamptz DEFAULT (now() + interval '24 hours'),
  UNIQUE (tenant_id, valid_date)
);

-- RLS: operators can verify (select) their own tenant's PIN for today
ALTER TABLE shop_daily_pins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operators can verify today's PIN"
  ON shop_daily_pins
  FOR SELECT
  USING (
    valid_date = CURRENT_DATE
    AND (
      tenant_id IS NULL
      OR tenant_id = (
        SELECT tenant_id FROM profiles
        WHERE id = auth.uid() LIMIT 1
      )
    )
  );

CREATE POLICY "Admins can manage daily PINs"
  ON shop_daily_pins
  FOR ALL
  USING (
    auth.jwt() -> 'user_metadata' ->> 'role' IN (
      'admin', 'super_admin', 'operations_manager', 'shop_manager'
    )
  );

-- Grant service role full access (bypasses RLS)
GRANT ALL ON shop_daily_pins TO service_role;
