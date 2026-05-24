-- Migration: Invoice Confirm Flow
-- Adds 'confirmed' status to invoices (between draft and sent)
-- and tracking columns for who confirmed and when.

DO $$
BEGIN
  -- Drop old status CHECK constraint if it exists, then add one that includes 'confirmed'
  ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
  ALTER TABLE public.invoices ADD CONSTRAINT invoices_status_check
    CHECK (status IN ('draft','confirmed','sent','paid','overdue','void','cancelled'));
EXCEPTION WHEN others THEN
  NULL; -- ignore if constraint manipulation fails (e.g. constraint named differently)
END $$;

-- Add confirmation tracking columns (idempotent)
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS confirmed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirm_notes TEXT;

-- Index for looking up invoices confirmed by a given user
CREATE INDEX IF NOT EXISTS invoices_confirmed_by_idx
  ON public.invoices(confirmed_by)
  WHERE confirmed_by IS NOT NULL;

-- Index for filtering by status (confirmed is a new value, helps the billing page filter)
CREATE INDEX IF NOT EXISTS invoices_status_idx
  ON public.invoices(status)
  WHERE status NOT IN ('void', 'cancelled');
