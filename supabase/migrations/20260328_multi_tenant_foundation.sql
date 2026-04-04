-- =============================================================================
-- MULTI-TENANT FOUNDATION MIGRATION
-- =============================================================================
-- This migration establishes multi-tenancy across the entire platform.
-- It adds tenant_id to all data tables, creates the first tenant (Patriot
-- Concrete Cutting), backfills all existing data, and creates helper functions.
--
-- Design decisions:
--   - tenant_id is NULLABLE for now to avoid breaking existing code
--   - All ALTER TABLE statements use IF NOT EXISTS for re-runnability
--   - Tables that may not exist yet are wrapped in exception handlers
--   - Indexes are created on high-traffic tables for query performance
-- =============================================================================


-- =============================================================================
-- SECTION 1: Add company_code column to tenants table
-- =============================================================================

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS company_code TEXT UNIQUE;

-- Add a CHECK constraint for format enforcement (uppercase, 3-20 chars)
DO $$ BEGIN
  ALTER TABLE tenants ADD CONSTRAINT chk_company_code_format
    CHECK (company_code ~ '^[A-Z0-9_]{3,20}$');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


-- =============================================================================
-- SECTION 2: Create the first tenant — Patriot Concrete Cutting
-- =============================================================================

INSERT INTO tenants (id, name, slug, domain, company_code, status, plan, max_users, max_jobs_per_month, owner_id, features)
VALUES (
  gen_random_uuid(),
  'Patriot Concrete Cutting',
  'patriot',
  NULL,
  'PATRIOT',
  'active',
  'enterprise',
  100,
  1000,
  'd50efe2d-3d51-4445-a6d2-293108965f33',
  '{"schedule_board": true, "timecards": true, "facilities": true, "billing": true, "nfc": true, "customer_crm": true, "analytics": true}'::jsonb
)
ON CONFLICT (company_code) DO NOTHING;


-- =============================================================================
-- SECTION 3: Add tenant_id to profiles
-- =============================================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);


-- =============================================================================
-- SECTION 4: Add tenant_id to ALL core data tables
-- =============================================================================
-- Each block is wrapped in a DO/EXCEPTION to handle tables that may not exist.

DO $$ BEGIN
  ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE customers ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE customer_contacts ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE equipment ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE equipment_units ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE timecards ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE facilities ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE operator_facility_badges ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE form_templates ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE job_documents ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE daily_job_logs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE work_items ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE nfc_tags ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE operator_time_off ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE schedule_form_submissions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE schedule_settings ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE signature_requests ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE customer_surveys ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE notifications ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE error_logs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE contractors ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE contractor_jobs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE standby_logs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE standby_policies ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE equipment_usage ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE equipment_checkout_sessions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE inventory ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE schedule_notifications ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE schedule_change_requests ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE operator_skills ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE job_notes ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE job_scope_additions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE job_crew_assignments ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE helper_work_logs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE maintenance_work_orders ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE scheduled_maintenance ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE login_attempts ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE access_requests ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE user_card_permissions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE dashboard_layouts ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE dashboard_tasks ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE dashboard_notes ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE daily_notes ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE team_messages ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE payments ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE operator_pay_rates ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE pay_periods ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE pay_period_entries ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE pay_adjustments ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE payroll_settings ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE timecard_breaks ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE timecard_settings ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE silica_plans ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE pdf_documents ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE generated_documents ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE consent_records ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE demo_requests ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE schedule_color_presets ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE schedule_contacts ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE missing_info_reminders ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE job_form_assignments ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE operator_notes ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE operator_workflow_sessions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE operator_workflow_log ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE operator_status_history ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;


-- =============================================================================
-- SECTION 5: Add tenant_id to tenant_branding and link existing row
-- =============================================================================

ALTER TABLE tenant_branding ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);


-- =============================================================================
-- SECTION 6: Backfill ALL existing data to the Patriot tenant
-- =============================================================================
-- Every row with a NULL tenant_id gets assigned to the Patriot tenant.

DO $$
DECLARE
  patriot_id UUID;
BEGIN
  SELECT id INTO patriot_id FROM tenants WHERE company_code = 'PATRIOT';

  IF patriot_id IS NULL THEN
    RAISE NOTICE 'PATRIOT tenant not found — skipping backfill';
    RETURN;
  END IF;

  -- Core tables
  UPDATE profiles SET tenant_id = patriot_id WHERE tenant_id IS NULL;
  UPDATE job_orders SET tenant_id = patriot_id WHERE tenant_id IS NULL;
  UPDATE customers SET tenant_id = patriot_id WHERE tenant_id IS NULL;

  -- Safely update each table (skip if table doesn't exist)
  BEGIN UPDATE customer_contacts SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE equipment SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE equipment_units SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE timecards SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE invoices SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE invoice_line_items SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE facilities SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE operator_facility_badges SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE form_templates SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE job_documents SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE daily_job_logs SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE work_items SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE nfc_tags SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE operator_time_off SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE schedule_form_submissions SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE schedule_settings SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE signature_requests SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE customer_surveys SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE notifications SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE audit_logs SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE error_logs SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE contractors SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE contractor_jobs SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE standby_logs SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE standby_policies SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE equipment_usage SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE equipment_checkout_sessions SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE inventory SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE inventory_transactions SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE schedule_notifications SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE schedule_change_requests SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE operator_skills SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE job_notes SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE job_scope_additions SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE job_crew_assignments SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE helper_work_logs SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE maintenance_work_orders SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE scheduled_maintenance SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE login_attempts SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE access_requests SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE user_onboarding SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE user_card_permissions SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE dashboard_layouts SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE dashboard_tasks SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE dashboard_notes SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE daily_notes SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE team_messages SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE payments SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE operator_pay_rates SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE pay_periods SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE pay_period_entries SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE pay_adjustments SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE payroll_settings SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE timecard_breaks SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE timecard_settings SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE silica_plans SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE pdf_documents SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE generated_documents SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE document_templates SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE consent_records SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE demo_requests SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE schedule_color_presets SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE schedule_contacts SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE missing_info_reminders SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE job_form_assignments SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE operator_notes SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE operator_workflow_sessions SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE operator_workflow_log SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE operator_status_history SET tenant_id = patriot_id WHERE tenant_id IS NULL; EXCEPTION WHEN undefined_table THEN NULL; END;

  RAISE NOTICE 'Backfill complete — all existing data assigned to PATRIOT tenant %', patriot_id;
END $$;


-- =============================================================================
-- SECTION 7: Link tenant_branding to Patriot tenant
-- =============================================================================

UPDATE tenant_branding
SET tenant_id = (SELECT id FROM tenants WHERE company_code = 'PATRIOT')
WHERE tenant_id IS NULL;


-- =============================================================================
-- SECTION 8: Populate tenant_users for all existing profiles
-- =============================================================================
-- Maps existing profiles into the tenant_users junction table.
-- super_admin users become 'owner', everyone else becomes 'member'.

INSERT INTO tenant_users (id, tenant_id, user_id, role, joined_at)
SELECT
  gen_random_uuid(),
  t.id,
  p.id,
  CASE WHEN p.role = 'super_admin' THEN 'owner' ELSE 'member' END,
  NOW()
FROM profiles p
CROSS JOIN tenants t
WHERE t.company_code = 'PATRIOT'
  AND NOT EXISTS (
    SELECT 1 FROM tenant_users tu
    WHERE tu.tenant_id = t.id AND tu.user_id = p.id
  );


-- =============================================================================
-- SECTION 9: Create indexes for performance
-- =============================================================================
-- Indexes on tenant_id for all high-traffic and frequently-queried tables.

CREATE INDEX IF NOT EXISTS idx_profiles_tenant ON profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_job_orders_tenant ON job_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customers_tenant ON customers(tenant_id);

-- Safely create indexes on tables that may not exist
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_customer_contacts_tenant ON customer_contacts(tenant_id); EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_equipment_tenant ON equipment(tenant_id); EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_equipment_units_tenant ON equipment_units(tenant_id); EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_timecards_tenant ON timecards(tenant_id); EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id); EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_facilities_tenant ON facilities(tenant_id); EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_daily_job_logs_tenant ON daily_job_logs(tenant_id); EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_work_items_tenant ON work_items(tenant_id); EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_notifications_tenant ON notifications(tenant_id); EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id); EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_schedule_form_submissions_tenant ON schedule_form_submissions(tenant_id); EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_nfc_tags_tenant ON nfc_tags(tenant_id); EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_operator_time_off_tenant ON operator_time_off(tenant_id); EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_signature_requests_tenant ON signature_requests(tenant_id); EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_contractors_tenant ON contractors(tenant_id); EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_inventory_tenant ON inventory(tenant_id); EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_operator_skills_tenant ON operator_skills(tenant_id); EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_job_notes_tenant ON job_notes(tenant_id); EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_job_crew_assignments_tenant ON job_crew_assignments(tenant_id); EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_payments_tenant ON payments(tenant_id); EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_pay_periods_tenant ON pay_periods(tenant_id); EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_operator_workflow_sessions_tenant ON operator_workflow_sessions(tenant_id); EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_team_messages_tenant ON team_messages(tenant_id); EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_tenant_branding_tenant ON tenant_branding(tenant_id); EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant ON tenant_users(tenant_id); EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_tenant_users_user ON tenant_users(user_id); EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- Composite index for common query pattern: tenant + status
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_job_orders_tenant_status ON job_orders(tenant_id, status); EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_invoices_tenant_status ON invoices(tenant_id, status); EXCEPTION WHEN undefined_table THEN NULL; END $$;


-- =============================================================================
-- SECTION 10: Create helper function to get tenant_id from user
-- =============================================================================
-- Used by API routes and RLS policies to resolve the current user's tenant.

CREATE OR REPLACE FUNCTION get_user_tenant_id(p_user_id UUID)
RETURNS UUID AS $$
  SELECT tenant_id FROM profiles WHERE id = p_user_id LIMIT 1;
$$ LANGUAGE sql STABLE;

-- Also create a function that gets tenant_id from the current JWT user
CREATE OR REPLACE FUNCTION get_current_tenant_id()
RETURNS UUID AS $$
  SELECT tenant_id FROM profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper to look up tenant by slug (for public-facing routes)
CREATE OR REPLACE FUNCTION get_tenant_by_slug(p_slug TEXT)
RETURNS UUID AS $$
  SELECT id FROM tenants WHERE slug = p_slug AND status = 'active' LIMIT 1;
$$ LANGUAGE sql STABLE;

-- Helper to look up tenant by company_code (for API auth)
CREATE OR REPLACE FUNCTION get_tenant_by_code(p_code TEXT)
RETURNS UUID AS $$
  SELECT id FROM tenants WHERE company_code = p_code AND status = 'active' LIMIT 1;
$$ LANGUAGE sql STABLE;


-- =============================================================================
-- DONE
-- =============================================================================
-- Next steps (in future migrations):
--   1. Make tenant_id NOT NULL on all tables once code is updated
--   2. Add RLS policies that filter by tenant_id
--   3. Add tenant_id to INSERT triggers/defaults
--   4. Create tenant provisioning functions
-- =============================================================================
