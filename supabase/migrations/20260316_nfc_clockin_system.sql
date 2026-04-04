-- ══════════════════════════════════════════════════════════════
-- NFC Clock-In Verification System
-- ══════════════════════════════════════════════════════════════

-- 1. NFC Tags registry — tracks all registered tags
CREATE TABLE IF NOT EXISTS public.nfc_tags (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tag_uid TEXT NOT NULL UNIQUE,             -- NFC tag serial number / UID
  tag_type TEXT NOT NULL DEFAULT 'shop',    -- shop | truck | jobsite
  label TEXT NOT NULL,                      -- Human-readable label e.g. "Shop Front Door", "Truck #3"
  truck_number TEXT,                        -- For truck tags: truck identifier
  jobsite_address TEXT,                     -- For jobsite tags: address
  is_active BOOLEAN NOT NULL DEFAULT true,
  registered_by UUID REFERENCES auth.users(id),
  last_scanned_at TIMESTAMPTZ,
  last_scanned_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add NFC verification columns to timecards
ALTER TABLE public.timecards
  ADD COLUMN IF NOT EXISTS clock_in_method TEXT NOT NULL DEFAULT 'gps',     -- nfc | gps | remote
  ADD COLUMN IF NOT EXISTS nfc_tag_id UUID REFERENCES public.nfc_tags(id),  -- which tag was scanned
  ADD COLUMN IF NOT EXISTS nfc_tag_uid TEXT,                                 -- raw NFC UID at scan time
  ADD COLUMN IF NOT EXISTS remote_photo_url TEXT,                            -- selfie for remote clock-in
  ADD COLUMN IF NOT EXISTS remote_verified BOOLEAN DEFAULT NULL,             -- null=pending, true=approved, false=rejected
  ADD COLUMN IF NOT EXISTS remote_verified_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS remote_verified_at TIMESTAMPTZ;

-- 3. RLS for nfc_tags
ALTER TABLE public.nfc_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nfc_tags_admin_all" ON public.nfc_tags
  FOR ALL
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('super_admin', 'operations_manager', 'admin')
  );

CREATE POLICY "nfc_tags_operators_read" ON public.nfc_tags
  FOR SELECT
  USING (
    is_active = true
    AND (auth.jwt() -> 'user_metadata' ->> 'role') IN ('operator', 'apprentice', 'shop_manager')
  );

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_nfc_tags_uid ON public.nfc_tags(tag_uid);
CREATE INDEX IF NOT EXISTS idx_nfc_tags_active ON public.nfc_tags(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_timecards_clock_in_method ON public.timecards(clock_in_method);
CREATE INDEX IF NOT EXISTS idx_timecards_remote_verified ON public.timecards(remote_verified) WHERE remote_verified IS NULL;
