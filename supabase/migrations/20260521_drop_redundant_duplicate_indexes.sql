-- ════════════════════════════════════════════════════════════════════
-- Migration: 20260521_drop_redundant_duplicate_indexes
-- Purpose: Remove 31 redundant non-unique indexes that duplicate
--          unique constraints or other identical indexes.
--          Every write to these tables paid for duplicate B-tree
--          maintenance with zero query benefit.
-- All drops are IF EXISTS — idempotent.
-- ════════════════════════════════════════════════════════════════════

DROP INDEX IF EXISTS public.idx_access_requests_email;       -- dup of UNIQUE access_requests_email_key
DROP INDEX IF EXISTS public.idx_analytics_daily_date;        -- dup of UNIQUE analytics_daily_date_key
DROP INDEX IF EXISTS public.idx_contact_backups_tenant;      -- dup of idx_contact_backups_tenant_date
DROP INDEX IF EXISTS public.idx_document_templates_key;      -- dup of UNIQUE document_templates_template_key_key
DROP INDEX IF EXISTS public.idx_equipment_unique_id;         -- dup of UNIQUE equipment_unique_identification_code_key
DROP INDEX IF EXISTS public.idx_equipment_qr_code;           -- dup of UNIQUE equipment_qr_code_key
DROP INDEX IF EXISTS public.idx_equipment_status;            -- dup of idx_equipment_status_v2
DROP INDEX IF EXISTS public.idx_equipment_units_nfc;         -- dup of UNIQUE equipment_units_nfc_tag_id_key
DROP INDEX IF EXISTS public.idx_helper_work_logs_helper_date;-- dup of UNIQUE helper_work_logs_shop_helper_date_uniq
DROP INDEX IF EXISTS public.idx_inventory_qr_code;           -- dup of UNIQUE inventory_qr_code_data_key
DROP INDEX IF EXISTS public.idx_invoices_completion_pdf;     -- plain idx on id (= primary key, already indexed)
DROP INDEX IF EXISTS public.idx_invoices_number;             -- dup of UNIQUE invoices_invoice_number_key
DROP INDEX IF EXISTS public.idx_jda_job_date;                -- dup of UNIQUE job_daily_assignments_job_order_id_assignment_date_key
DROP INDEX IF EXISTS public.idx_job_orders_job_number;       -- dup of UNIQUE job_orders_job_number_key
DROP INDEX IF EXISTS public.idx_nfc_tags_uid;                -- dup of UNIQUE nfc_tags_tag_uid_key
DROP INDEX IF EXISTS public.idx_nfc_tags_pontifex_nfc_id;    -- dup of UNIQUE nfc_tags_pontifex_nfc_id_key
DROP INDEX IF EXISTS public.idx_pay_rates_operator_active;   -- dup of UNIQUE unique_active_rate
DROP INDEX IF EXISTS public.idx_row_notes_operator_date;     -- dup of UNIQUE operator_row_notes_operator_id_date_key
DROP INDEX IF EXISTS public.idx_time_off_date;               -- dup of idx_operator_time_off_date
DROP INDEX IF EXISTS public.idx_time_off_operator_date;      -- dup of UNIQUE operator_time_off_operator_id_date_key
DROP INDEX IF EXISTS public.idx_time_off_tenant;             -- dup of idx_operator_time_off_tenant
DROP INDEX IF EXISTS public.idx_pay_periods_dates;           -- dup of UNIQUE unique_pay_period
DROP INDEX IF EXISTS public.idx_profiles_email;              -- dup of UNIQUE profiles_email_key
DROP INDEX IF EXISTS public.idx_role_permissions_tenant_role;-- dup of UNIQUE role_permissions_tenant_id_role_key
DROP INDEX IF EXISTS public.idx_scr_job;                     -- dup of idx_schedule_cr_job_order_id
DROP INDEX IF EXISTS public.idx_scr_status;                  -- dup of idx_schedule_cr_status
DROP INDEX IF EXISTS public.idx_sig_requests_token;          -- dup of UNIQUE signature_requests_token_key
DROP INDEX IF EXISTS public.idx_silica_plans_job_order;      -- dup of UNIQUE silica_plans_job_order_id_key
DROP INDEX IF EXISTS public.idx_tenants_slug;                -- dup of UNIQUE tenants_slug_key
DROP INDEX IF EXISTS public.idx_timecard_weeks_user_week;    -- dup of UNIQUE timecard_weeks_user_id_week_start_key
DROP INDEX IF EXISTS public.timecards_open_lookup;           -- dup of partial UNIQUE timecards_one_open_per_user
DROP INDEX IF EXISTS public.idx_vehicles_equipment;          -- dup of UNIQUE vehicles_equipment_id_key
