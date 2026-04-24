-- Add a FK from operator_time_off.operator_id to public.profiles(id)
-- so PostgREST can resolve the `profiles:operator_id(full_name)` embed
-- used by /api/admin/schedule-board/time-off. Every profile row mirrors
-- an auth.users row, and we verified 0 orphans before applying.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'operator_time_off_operator_profile_fkey'
  ) THEN
    ALTER TABLE public.operator_time_off
      ADD CONSTRAINT operator_time_off_operator_profile_fkey
      FOREIGN KEY (operator_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;
