-- ============================================================================
-- deleted_timecards — the payroll archive behind "delete a duplicate entry"
-- ============================================================================
-- Founder need (Aug 2026): an operator sometimes clocks in/out several times a
-- day. Multiples are OFTEN LEGITIMATE (two-jobs-per-day sequencing, shop time
-- after field time), so this is a human-judgment tool — the office picks ONE
-- entry to remove. There was no way to remove one at all.
--
-- WHY AN ARCHIVE + HARD DELETE, NOT A `deleted_at` SOFT-DELETE FLAG:
-- `timecards` is read by 108 distinct TypeScript call sites plus five Postgres
-- views (`timecards_with_users`, `job_pnl_summary`, `job_profitability`,
-- `job_completion_summary`, `active_job_orders_v3` — all plain views, none
-- materialized, so a delete propagates instantly) and several BEFORE-UPDATE
-- triggers. A soft-delete
-- flag is only correct if EVERY one of those reads filters it out; a single
-- missed read path silently keeps paying someone for an entry the office
-- believes it deleted. That failure is invisible and lands in a paycheck.
-- A hard delete makes all 108 read paths correct by construction, and payroll
-- auditability is preserved here instead: the complete row (plus its cascade
-- children) is snapshotted as jsonb before removal, so any delete is fully
-- reconstructible and attributable. Nothing is destroyed — it is relocated.
--
-- Cascade children captured in `related` (all would otherwise be lost to the
-- ON DELETE CASCADE on timecards): timecard_breaks, timecard_correction_requests,
-- timecard_gps_logs, timecard_pay_links.
--
-- Idempotent + additive: safe to re-run, touches no existing table's data.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.deleted_timecards (
  -- gen_random_uuid() (pg_catalog), NOT uuid_generate_v4() — the latter lives in
  -- the `extensions` schema and only resolves when it happens to be on the
  -- search_path. Older tables here use it; new ones should not depend on that.
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity of the removed card (denormalized so the archive is queryable
  -- and human-readable without digging into the jsonb blob).
  original_timecard_id uuid NOT NULL,
  tenant_id            uuid REFERENCES public.tenants(id),
  user_id              uuid NOT NULL,
  date                 date NOT NULL,
  clock_in_time        timestamptz,
  clock_out_time       timestamptz,
  total_hours          numeric,
  job_order_id         uuid,
  entry_type           text,
  was_approved         boolean NOT NULL DEFAULT false,

  -- The complete pre-delete state. `timecard` is the whole row; `related` holds
  -- the cascade children keyed by table name.
  timecard             jsonb NOT NULL,
  related              jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Who / why. `reason` is required by the API — payroll deletions are never
  -- anonymous and never unexplained.
  reason               text NOT NULL,
  deleted_by           uuid NOT NULL,
  deleted_by_email     text,
  deleted_by_role      text,
  deleted_at           timestamptz NOT NULL DEFAULT now()
);

-- Lookup patterns: "what was removed for this person/week" and "did this card
-- get deleted" (reconciling a payroll dispute against an id in an old export).
CREATE INDEX IF NOT EXISTS idx_deleted_timecards_tenant_date
  ON public.deleted_timecards (tenant_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_deleted_timecards_user_date
  ON public.deleted_timecards (user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_deleted_timecards_original
  ON public.deleted_timecards (original_timecard_id);

ALTER TABLE public.deleted_timecards ENABLE ROW LEVEL SECURITY;

-- Read-only to management, tenant-scoped. Writes happen exclusively through the
-- service-role API route (which bypasses RLS) — no client ever inserts here, and
-- nothing may UPDATE or DELETE an archive row: that is the point of an archive.
-- Role/tenant come from the SECURITY DEFINER helpers that read public.profiles,
-- never from auth.jwt() -> 'user_metadata' (client-writable, self-promotable).
DO $$
BEGIN
  CREATE POLICY "Management reads deleted timecards in their tenant"
    ON public.deleted_timecards
    FOR SELECT
    USING (
      public.current_user_has_role('admin', 'super_admin', 'operations_manager')
      AND tenant_id = public.current_user_tenant_id()
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE public.deleted_timecards IS
  'Append-only payroll archive. Every timecard removed via DELETE /api/admin/timecards/[id] is snapshotted here in full (row + cascade children) with who deleted it and why, before the row is hard-deleted from timecards. Hard delete is deliberate: 108 read paths and 4 views read timecards, and a missed soft-delete filter would keep paying someone.';
COMMENT ON COLUMN public.deleted_timecards.timecard IS
  'Complete pre-delete timecards row as jsonb — sufficient to reconstruct the entry exactly.';
COMMENT ON COLUMN public.deleted_timecards.related IS
  'Cascade children snapshotted before deletion, keyed by table name: timecard_breaks, timecard_correction_requests, timecard_gps_logs, timecard_pay_links.';
