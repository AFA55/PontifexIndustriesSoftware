-- Adds a truck_number column to profiles so an operator can be associated with
-- a specific truck for equipment-checkout purposes (shown on Team Profile edit,
-- usable by the manual + future voice checkout flows to pre-fill/display truck
-- context). Column lives on an already-RLS'd table — no new policies needed.
--
-- Applied directly to production via Supabase MCP on 2026-07-01 (additive,
-- idempotent). This file documents it in the migration history.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS truck_number text;

COMMENT ON COLUMN public.profiles.truck_number IS
  'Operator''s assigned truck number/identifier (free text, e.g. "12" or "T-104"). Used by equipment checkout UI + voice-checkout to default the truck for this operator. Not a FK to equipment/vehicles — those are tracked separately in the equipment table (kind=vehicle).';

NOTIFY pgrst, 'reload schema';
