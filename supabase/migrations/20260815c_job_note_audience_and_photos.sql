-- TWO AUDIENCES ON A JOB NOTE (founder, Aug 15):
--   "Let's create two note areas when we click a job — internal notes, and
--    notes for operator, so operators can see notes within certain jobs."
--
-- Today a job note is one undifferentiated stream. The office cannot say
-- something to each other without the crew potentially seeing it, and cannot
-- say something TO the crew with any confidence that they will.
--
-- WHY A NEW `audience` COLUMN RATHER THAN REUSING `note_type`
-- `note_type` already carries the note's KIND, and live code reads it that way:
-- work-performed filters `note_type === 'amendment'`, day-complete writes
-- 'completion' / 'done_for_day', EditJobPanel writes 'change_request', and the
-- schedule-board badge + three API routes exclude 'change_log'. Overloading the
-- same column with WHO-CAN-SEE-IT would have made the RLS predicate an
-- ever-growing literal list ("operator OR amendment OR done_for_day OR
-- completion OR …") — a list that rots the first time someone adds a kind and
-- forgets the visibility list. That is the exact weak-join failure this
-- platform keeps paying for. Audience is one column, one predicate, one place
-- to be wrong.
--
-- BACKFILL DEFAULT = 'internal'. Promoting a note the office believed was
-- private is strictly worse than hiding one they believed was shared: the first
-- is a disclosure with no undo, the second is a complaint. The DEFAULT does the
-- backfill (every existing row is 'internal'), and authors keep reading their
-- own notes regardless of audience — so nobody LOSES sight of anything they can
-- see today; the crew simply gains nothing until the office deliberately
-- addresses them.

-- ── 1. Columns ───────────────────────────────────────────────────────────────
ALTER TABLE public.job_notes
  ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'internal';

-- Photos/documents live on the note row. Same storage shape the rest of the
-- platform uses (scope_photo_urls, attachment_urls) so PhotoUploader/PhotoViewer
-- drop straight in.
ALTER TABLE public.job_notes
  ADD COLUMN IF NOT EXISTS photo_urls text[] NOT NULL DEFAULT '{}'::text[];

DO $$ BEGIN
  ALTER TABLE public.job_notes
    ADD CONSTRAINT job_notes_audience_check CHECK (audience IN ('internal', 'operator'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Explicit backfill as well as the DEFAULT — a pre-existing NULL-able variant of
-- this column in any branch DB still lands on the safe value.
UPDATE public.job_notes SET audience = 'internal' WHERE audience IS NULL;

-- The operator's read path is (job_order_id, audience); the office reads the
-- whole job.
CREATE INDEX IF NOT EXISTS idx_job_notes_job_audience
  ON public.job_notes (job_order_id, audience);

-- ── 2. Crew membership helper ────────────────────────────────────────────────
-- A READER THAT ONLY CHECKS `assigned_to` IS WRONG HERE. This platform crews a
-- job three different ways and all three are real:
--   • job_orders.assigned_to / helper_assigned_to — the job-level slots
--   • job_daily_assignments                        — the PER-DAY ledger, which
--     is how the board actually places people (a job can be crewed entirely
--     through it with both slots null — see lib/dispatch.ts)
--   • job_crew                                     — extra crew added via "+"
-- Four production bugs in one week came from readers that knew about only the
-- first. SECURITY DEFINER so the check itself is not re-filtered by RLS on the
-- three source tables.
CREATE OR REPLACE FUNCTION public.is_job_crew_member(p_job_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.job_orders jo
      WHERE jo.id = p_job_order_id
        AND (jo.assigned_to = auth.uid() OR jo.helper_assigned_to = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.job_daily_assignments jda
      WHERE jda.job_order_id = p_job_order_id
        AND (jda.operator_id = auth.uid() OR jda.helper_id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.job_crew jc
      WHERE jc.job_order_id = p_job_order_id
        AND jc.user_id = auth.uid()
    );
$$;

REVOKE ALL ON FUNCTION public.is_job_crew_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_job_crew_member(uuid) TO authenticated;

COMMENT ON FUNCTION public.is_job_crew_member(uuid) IS
  'True when the CURRENT user is crewed on the job via any of the three real assignment paths: job_orders slots, job_daily_assignments (the per-day ledger), or job_crew.';

-- ── 3. RLS ───────────────────────────────────────────────────────────────────
-- The old policy let a reader see a note only if they authored it or held an
-- office role. Replaced so that operator-audience notes reach the crew — and
-- ONLY operator-audience notes. `internal` never leaves the office set.
--
-- Office roles are the explicit ALLOWLIST of non-worker tiers from
-- lib/rbac.ts (worker tier = operator / apprentice / shop_help). An allowlist,
-- not a denylist, so a role invented next month does not silently inherit
-- internal notes.
DROP POLICY IF EXISTS "Operators can read notes for their jobs" ON public.job_notes;

DO $$ BEGIN
  CREATE POLICY "job_notes_read_by_audience" ON public.job_notes
    FOR SELECT
    USING (
      -- Your own note, whatever its audience.
      author_id = auth.uid()
      -- The office reads both audiences.
      OR public.current_user_has_role(
           'super_admin', 'operations_manager', 'admin',
           'supervisor', 'salesman', 'shop_manager', 'inventory_manager'
         )
      -- The crew reads notes addressed TO them, on jobs they are crewed on.
      OR (
        audience = 'operator'
        AND note_type IS DISTINCT FROM 'change_log'
        AND public.is_job_crew_member(job_order_id)
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN public.job_notes.audience IS
  'internal = office only. operator = visible to the job crew (and its photos with it). Backfilled to internal; see 20260815c.';
COMMENT ON COLUMN public.job_notes.photo_urls IS
  'Attachments on the note. Visible to the crew only when audience = operator.';
