-- ============================================================================
-- PARK AND RESTART — a job leaves the schedule and comes back with a new scope,
-- keeping its job number.
--
-- Leifeng Construction, JOB-2026-400368. Crew on it Aug 10, Aug 11, Aug 13.
-- The contractor pushed it off. It sat TEN DAYS and nobody saw it sitting,
-- because a parked job is simply absent from every count the office looks at.
-- It comes back Friday Aug 21 to do different work under the same contract.
--
--   "I don't want to duplicate the ticket and extend dates, because then it
--    would say that we've been working on it all week when that's not the
--    case… same job ID should stay because same contract info."
--
-- Leifeng is not alone. On the day this was written, production held SIX jobs
-- in `on_hold`, five still parked, the oldest since Jul 28 — twenty-three days.
-- None of them appeared anywhere the office would look.
--
-- ── PARKED IS `on_hold`. IT IS NOT A NEW STATE. ─────────────────────────────
--
-- `job_orders` already carries `on_hold`, `on_hold_placed_at`,
-- `on_hold_placed_by`, `on_hold_reason`, `on_hold_released_at`, a `status` that
-- takes 'on_hold', a park route, a reactivate route, an operator-initiated
-- "site not ready" park, and a legal-transition map that lets a parked job move
-- back to scheduled/assigned/in_route. A second flag meaning the same thing
-- would give the office two answers to "is this job moving?" — and the pair
-- ALREADY disagree in production (see the predicate note below). Doubling that
-- is not a design, it is a second bug.
--
-- What was missing was never the state. It was (a) somewhere to SEE it, (b) a
-- record of the runs of work either side of it, and (c) the release.
--
-- ── WHAT THIS MIGRATION DOES NOT DO ─────────────────────────────────────────
--
-- It does not touch `set_daily_log_day_number()`. It does not touch
-- `update_total_days_worked()`. It does not touch `job_workday_evidence`. It
-- renumbers nothing and backfills nothing.
--
-- That restraint is load-bearing twice:
--
--  1. `daily_job_logs.day_number` is a KEY, not a label. 71 of the 92
--     `work_items` rows in production carry a `day_number` and NO
--     `daily_log_id` — they are reachable only by (job, day_number). If a
--     restart reset the stored numbering to 1, a job would hold two "Day 1"s
--     and those orphan billing rows would collide. The Aug 14 migration
--     remapped them exactly once, in a deliberate order, to avoid filing one
--     day's footage under another day's heading. Doing that again on every
--     park would be a standing invitation to bill the wrong day.
--
--  2. The Aug 14 proof rule lives in ONE place — `job_workday_evidence` — and
--     both functions read it. A date counts only when the job can PROVE a crew
--     was on it: a filed log, or the office placed a NAMED crew AND that person
--     clocked in. A plan is not attendance.
--
-- So the per-phase ordinal is derived at READ time, in `lib/job-phases.ts`,
-- from that same list of proven dates. There is still exactly one definition of
-- which dates count; this feature only draws a line through them.
-- `total_days_worked` keeps the single owner it already has and gains no
-- fourth writer.
--
-- ── AND IT NEEDS NO BACKFILL ────────────────────────────────────────────────
-- A job that has never been restarted has no rows in `job_phases`, and every
-- function in `lib/job-phases.ts` reads that as one implicit phase — so
-- `phaseDay === lifetimeDay` and every existing job, ticket and invoice reads
-- byte-for-byte as it did before. The five jobs sitting parked right now are
-- untouched by this migration.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. `job_phases` — the runs of work, and the gap between them
--
-- One row per run. Phase 1 is the original scope; each restart adds one. Rows
-- are written ONLY on restart (which backfills phase 1 from the job's own
-- description at that moment), so parking alone — the common case, and the
-- thing five production jobs are doing today — creates nothing and changes
-- nothing.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.job_phases (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  job_order_id   uuid NOT NULL REFERENCES public.job_orders(id) ON DELETE CASCADE,

  -- 1, 2, 3… The job number never changes; this is what tells the phases apart.
  phase_number   integer NOT NULL CHECK (phase_number >= 1),

  -- First scheduled day of this run. A date, not a timestamp: the board, the
  -- ticket and the day ordinal are all calendar-day questions, and a timestamp
  -- here would reintroduce the timezone bug this codebase keeps paying for.
  started_on     date NOT NULL,

  -- The scope as the office described it FOR THIS RUN. The old wording stays
  -- here, readable, forever — "nothing typed is ever lost". The CURRENT scope
  -- is also mirrored onto job_orders.description, because that (with
  -- scope_details) is what the crew's phone actually renders.
  scope_text     text,

  -- Stamped when this phase is parked; NULL while it is the live run.
  parked_on      date,
  park_reason    text,
  parked_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

  restarted_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT job_phases_job_phase_unique UNIQUE (job_order_id, phase_number)
);

CREATE INDEX IF NOT EXISTS idx_job_phases_job
  ON public.job_phases (job_order_id, phase_number);
CREATE INDEX IF NOT EXISTS idx_job_phases_tenant
  ON public.job_phases (tenant_id);

COMMENT ON TABLE public.job_phases IS
  'Runs of work on one job across a park/restart. Same job number throughout — '
  'the contract did not change, only the scope and the calendar. Absence of '
  'rows means the job was never restarted and behaves exactly as before.';
COMMENT ON COLUMN public.job_phases.started_on IS
  'First scheduled day of this run. A date belongs to the LAST phase that had '
  'started by then; see phaseForDate() in lib/job-phases.ts.';
COMMENT ON COLUMN public.job_phases.scope_text IS
  'The scope for THIS run. Phase 1 is backfilled from job_orders.description at '
  'the moment of the first restart, so the original wording survives being '
  'overwritten by the new one.';

-- updated_at
DROP TRIGGER IF EXISTS trg_job_phases_updated_at ON public.job_phases;
CREATE TRIGGER trg_job_phases_updated_at
  BEFORE UPDATE ON public.job_phases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RLS — tenant-scoped, via the SECURITY DEFINER helpers.
--
-- NEVER `auth.jwt() -> 'user_metadata'`: it is client-writable, so any operator
-- could `updateUser({ data: { role: 'super_admin' } })` and read every tenant's
-- jobs. Supabase's own linter flags that as an ERROR.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.job_phases ENABLE ROW LEVEL SECURITY;

-- Read: anyone inside the tenant. A phase is scope-and-dates — the same thing
-- the crew already reads off the job itself, and the operator's phone needs it
-- to show which run today belongs to.
DO $$
BEGIN
  CREATE POLICY job_phases_tenant_read ON public.job_phases
    FOR SELECT
    USING (tenant_id = public.current_user_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Write: only the roles that can already park a job through
-- /api/admin/pending-jobs/[id]/park, which is guarded by requireSalesStaff.
-- Deliberately NOT the schedule-VIEWER set: that includes shop_manager, who is
-- documented as read-only ("NEVER use on POST/PATCH/DELETE") and has no
-- business parking a customer's job.
DO $$
BEGIN
  CREATE POLICY job_phases_dispatch_write ON public.job_phases
    FOR ALL
    USING (
      public.current_user_has_role('admin','super_admin','operations_manager','supervisor','salesman')
      AND tenant_id = public.current_user_tenant_id()
    )
    WITH CHECK (
      public.current_user_has_role('admin','super_admin','operations_manager','supervisor','salesman')
      AND tenant_id = public.current_user_tenant_id()
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. The board must be able to SEE a parked job.
--
-- `schedule_board_view` carries `jo.status` but NONE of the on_hold columns, so
-- the board could not say how long anything had been sitting even if it wanted
-- to. That is the whole of failure (a): Leifeng sat ten days in a column that
-- did not exist.
--
-- CREATE OR REPLACE, columns APPENDED at the end — Postgres permits that and it
-- avoids DROP … CASCADE. The Aug 15 patch that excludes 'change_log' notes from
-- `notes_count` is reproduced verbatim below; rebuilding this view from the
-- older migration file would silently regress that badge.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.schedule_board_view AS
  SELECT jo.id,
    jo.job_number,
    jo.title,
    jo.customer_name,
    jo.customer_id,
    jo.job_type,
    jo.location,
    jo.address,
    jo.project_name,
    jo.status,
    jo.priority,
    jo.scheduled_date,
    jo.scheduled_end_date,
    jo.end_date,
    jo.arrival_time,
    jo.shop_arrival_time,
    jo.equipment_needed,
    jo.equipment_selections,
    jo.special_equipment,
    jo.scope_details,
    jo.is_will_call,
    jo.assigned_to,
    jo.helper_assigned_to,
    jo.estimated_hours,
    jo.estimated_cost,
    jo.description,
    jo.difficulty_rating,
    jo.po_number,
    jo.site_contact_phone,
    jo.site_compliance,
    jo.jobsite_conditions,
    jo.scheduling_flexibility,
    jo.additional_info,
    jo.salesman_name,
    jo.created_via,
    jo.created_at,
    jo.facility_id,
    jo.rejection_reason,
    jo.rejection_notes,
    jo.rejected_at,
    jo.tenant_id,
    jo.missing_info_flagged,
    jo.missing_info_items,
    jo.missing_info_note,
    jo.in_route_at,
    jo.arrived_at_jobsite_at,
    jo.work_started_at,
    jo.work_completed_at,
    op.full_name AS operator_name,
    hp.full_name AS helper_name,
    creator.full_name AS created_by_name,
    ( SELECT count(*) AS count
        FROM job_notes jn
       WHERE jn.job_order_id = jo.id
         AND jn.note_type IS DISTINCT FROM 'change_log'::text) AS notes_count,
    0::bigint AS pending_change_requests_count,
    -- ── APPENDED: the parked facts ──────────────────────────────────────────
    jo.on_hold,
    jo.on_hold_reason,
    jo.on_hold_placed_at,
    jo.on_hold_placed_by,
    jo.on_hold_released_at,
    jo.total_days_worked
   FROM job_orders jo
     LEFT JOIN profiles op ON jo.assigned_to = op.id
     LEFT JOIN profiles hp ON jo.helper_assigned_to = hp.id
     LEFT JOIN profiles creator ON jo.created_by = creator.id
  WHERE jo.deleted_at IS NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Audit: let the history table accept the two new change types.
--
-- `job_orders_history` has a CHECK constraint on `change_type`, and every
-- insert against it is fire-and-forget — so a value missing from this list is
-- REJECTED SILENTLY and the audit row simply never appears. That is exactly how
-- seven change types went missing before Aug 6. Adding the values here is not
-- optional bookkeeping; without it, parking and restarting a job would leave no
-- trace at all.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.job_orders_history
  DROP CONSTRAINT IF EXISTS job_orders_history_change_type_check;

ALTER TABLE public.job_orders_history
  ADD CONSTRAINT job_orders_history_change_type_check
  CHECK (change_type = ANY (ARRAY[
    'created',
    'updated',
    'status_changed',
    'assigned',
    'deleted',
    'day_ticket_reset',
    'office_completed',
    'office_reopened',
    'rejected',
    'approved',
    'reopened_for_edit',
    'duplicated',
    'resubmitted',
    'new_scope_job_created',
    'parked',
    'restarted'
  ]));
