-- Enhance operator_time_off table:
-- 1. Add is_paid flag
-- 2. Add end_date for date ranges
-- 3. Expand valid types (callout, vacation, bereavement, personal)
-- 4. Add pto_allocated column to profiles for PTO tracking

-- Add is_paid column
ALTER TABLE public.operator_time_off
  ADD COLUMN IF NOT EXISTS is_paid BOOLEAN NOT NULL DEFAULT false;

-- Add end_date for multi-day ranges (null = single day, same as date)
ALTER TABLE public.operator_time_off
  ADD COLUMN IF NOT EXISTS end_date DATE;

-- Drop the old check constraint and replace with expanded type list
ALTER TABLE public.operator_time_off
  DROP CONSTRAINT IF EXISTS operator_time_off_type_check;

ALTER TABLE public.operator_time_off
  ADD CONSTRAINT operator_time_off_type_check
  CHECK (type IN (
    'pto',
    'unpaid',
    'worked_last_night',
    'sick',
    'callout',
    'vacation',
    'bereavement',
    'personal',
    'other',
    'unavailable',
    'personal_day',
    'no_show'
  ));

-- Add pto_allocated to profiles if not there
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pto_allocated INTEGER NOT NULL DEFAULT 10;

-- Backfill is_paid for existing PTO/vacation rows
UPDATE public.operator_time_off
  SET is_paid = true
  WHERE type IN ('pto', 'vacation');

-- Index on end_date for range queries
CREATE INDEX IF NOT EXISTS idx_time_off_end_date ON public.operator_time_off(end_date);
CREATE INDEX IF NOT EXISTS idx_time_off_tenant ON public.operator_time_off(tenant_id);

COMMENT ON COLUMN public.operator_time_off.is_paid IS 'Whether the time off is paid (PTO/vacation) or unpaid';
COMMENT ON COLUMN public.operator_time_off.end_date IS 'Last day of multi-day range; NULL means single day (= date)';
COMMENT ON COLUMN public.profiles.pto_allocated IS 'Annual PTO days allocated to this employee';
