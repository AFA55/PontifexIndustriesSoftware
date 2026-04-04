-- ============================================================
-- Security Audit Fixes — February 28, 2026
-- Fixes: SECURITY DEFINER views, missing FK indexes
-- ============================================================

-- Fix SECURITY DEFINER views → SECURITY INVOKER
-- These views were bypassing caller's RLS, running with creator's permissions
ALTER VIEW IF EXISTS public.active_job_orders SET (security_invoker = true);
ALTER VIEW IF EXISTS public.job_document_stats SET (security_invoker = true);
ALTER VIEW IF EXISTS public.job_orders_history_readable SET (security_invoker = true);
ALTER VIEW IF EXISTS public.operator_performance_summary SET (security_invoker = true);
ALTER VIEW IF EXISTS public.recent_completed_jobs SET (security_invoker = true);
ALTER VIEW IF EXISTS public.timecards_with_users SET (security_invoker = true);
ALTER VIEW IF EXISTS public.work_accessibility_analytics SET (security_invoker = true);

-- Add missing indexes on unindexed foreign key columns
-- These improve JOIN/DELETE performance
CREATE INDEX IF NOT EXISTS idx_access_requests_reviewed_by ON public.access_requests(reviewed_by);
CREATE INDEX IF NOT EXISTS idx_blade_assignments_assigned_by ON public.blade_assignments(assigned_by);
CREATE INDEX IF NOT EXISTS idx_completed_jobs_archived_by ON public.completed_jobs_archive(archived_by);
CREATE INDEX IF NOT EXISTS idx_contractors_created_by ON public.contractors(created_by);
CREATE INDEX IF NOT EXISTS idx_customers_created_by ON public.customers(created_by);
CREATE INDEX IF NOT EXISTS idx_equipment_assigned_by ON public.equipment(assigned_by);
CREATE INDEX IF NOT EXISTS idx_equipment_assigned_to_operator ON public.equipment(assigned_to_operator);
CREATE INDEX IF NOT EXISTS idx_equipment_created_by ON public.equipment(created_by);
CREATE INDEX IF NOT EXISTS idx_equipment_units_assigned_by ON public.equipment_units(assigned_by);
CREATE INDEX IF NOT EXISTS idx_equipment_units_created_by ON public.equipment_units(created_by);
CREATE INDEX IF NOT EXISTS idx_equipment_units_retired_by ON public.equipment_units(retired_by);
CREATE INDEX IF NOT EXISTS idx_inventory_created_by ON public.inventory(created_by);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_equipment_id ON public.inventory_transactions(equipment_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_performed_by ON public.inventory_transactions(performed_by);
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_operator_id ON public.invoice_line_items(operator_id);
CREATE INDEX IF NOT EXISTS idx_invoices_created_by ON public.invoices(created_by);
CREATE INDEX IF NOT EXISTS idx_invoices_sent_by ON public.invoices(sent_by);
CREATE INDEX IF NOT EXISTS idx_job_crew_assignments_assigned_by ON public.job_crew_assignments(assigned_by);
CREATE INDEX IF NOT EXISTS idx_job_documents_created_by ON public.job_documents(created_by);
CREATE INDEX IF NOT EXISTS idx_job_orders_created_by ON public.job_orders(created_by);
CREATE INDEX IF NOT EXISTS idx_job_orders_deleted_by ON public.job_orders(deleted_by);
CREATE INDEX IF NOT EXISTS idx_job_orders_accessibility_submitted_by ON public.job_orders(work_area_accessibility_submitted_by);
CREATE INDEX IF NOT EXISTS idx_job_orders_history_changed_by ON public.job_orders_history(changed_by);
CREATE INDEX IF NOT EXISTS idx_job_status_history_changed_by ON public.job_status_history(changed_by);
CREATE INDEX IF NOT EXISTS idx_mwo_assigned_by ON public.maintenance_work_orders(assigned_by);
CREATE INDEX IF NOT EXISTS idx_mwo_created_by ON public.maintenance_work_orders(created_by);
CREATE INDEX IF NOT EXISTS idx_mwo_request_event_id ON public.maintenance_work_orders(request_event_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_operator_pay_rates_approved_by ON public.operator_pay_rates(approved_by);
CREATE INDEX IF NOT EXISTS idx_pay_adjustments_approved_by ON public.pay_adjustments(approved_by);
CREATE INDEX IF NOT EXISTS idx_pay_adjustments_created_by ON public.pay_adjustments(created_by);
CREATE INDEX IF NOT EXISTS idx_pay_adjustments_job_order_id ON public.pay_adjustments(job_order_id);
CREATE INDEX IF NOT EXISTS idx_pay_period_entries_reviewed_by ON public.pay_period_entries(reviewed_by);
CREATE INDEX IF NOT EXISTS idx_pay_periods_approved_by ON public.pay_periods(approved_by);
CREATE INDEX IF NOT EXISTS idx_pay_periods_locked_by ON public.pay_periods(locked_by);
CREATE INDEX IF NOT EXISTS idx_pay_periods_processed_by ON public.pay_periods(processed_by);
CREATE INDEX IF NOT EXISTS idx_payments_created_by ON public.payments(created_by);
CREATE INDEX IF NOT EXISTS idx_payments_received_by ON public.payments(received_by);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);
CREATE INDEX IF NOT EXISTS idx_payroll_settings_updated_by ON public.payroll_settings(updated_by);
CREATE INDEX IF NOT EXISTS idx_scheduled_maintenance_created_by ON public.scheduled_maintenance(created_by);
CREATE INDEX IF NOT EXISTS idx_scheduled_maintenance_completed_by ON public.scheduled_maintenance(last_completed_by);
CREATE INDEX IF NOT EXISTS idx_silica_plans_created_by ON public.silica_plans(created_by);
CREATE INDEX IF NOT EXISTS idx_standby_logs_contractor_id ON public.standby_logs(contractor_id);
CREATE INDEX IF NOT EXISTS idx_standby_policies_created_by ON public.standby_policies(created_by);
CREATE INDEX IF NOT EXISTS idx_timecards_approved_by ON public.timecards(approved_by);
CREATE INDEX IF NOT EXISTS idx_unit_events_performed_by ON public.unit_events(performed_by);
CREATE INDEX IF NOT EXISTS idx_user_card_permissions_updated_by ON public.user_card_permissions(updated_by);
CREATE INDEX IF NOT EXISTS idx_work_items_created_by ON public.work_items(created_by);
CREATE INDEX IF NOT EXISTS idx_demo_requests_status ON public.demo_requests(status);
