-- ── operator_daily_reports ────────────────────────────────────────────────
-- Daily end-of-shift self-assessment submitted by operators, helpers, and
-- shop staff before they clock out. Applied 2026-05-25 via Supabase MCP.

CREATE TABLE IF NOT EXISTS operator_daily_reports (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  operator_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date            date        NOT NULL DEFAULT CURRENT_DATE,
  primary_job_id  uuid        REFERENCES job_orders(id) ON DELETE SET NULL,
  what_i_did      text,
  what_i_learned  text,
  what_to_work_on text,
  additional_notes text,
  voice_note_url  text,
  is_draft        boolean     NOT NULL DEFAULT true,
  submitted_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operator_id, date)
);

CREATE OR REPLACE FUNCTION update_operator_daily_reports_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_operator_daily_reports_updated_at ON operator_daily_reports;
CREATE TRIGGER trg_operator_daily_reports_updated_at
  BEFORE UPDATE ON operator_daily_reports
  FOR EACH ROW EXECUTE FUNCTION update_operator_daily_reports_updated_at();

ALTER TABLE operator_daily_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "operator_daily_reports_own" ON operator_daily_reports FOR ALL
  USING (operator_id = auth.uid() AND tenant_id = public.current_user_tenant_id())
  WITH CHECK (operator_id = auth.uid() AND tenant_id = public.current_user_tenant_id());

CREATE POLICY "operator_daily_reports_admin_read" ON operator_daily_reports FOR SELECT
  USING (
    public.current_user_has_role('admin','super_admin','operations_manager','supervisor')
    AND tenant_id = public.current_user_tenant_id()
  );

CREATE INDEX IF NOT EXISTS idx_odr_operator_date ON operator_daily_reports (operator_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_odr_tenant_date   ON operator_daily_reports (tenant_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_odr_job           ON operator_daily_reports (primary_job_id) WHERE primary_job_id IS NOT NULL;
