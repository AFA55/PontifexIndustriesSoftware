-- Add missing fields to schedule_board_view so the Approval modal has full job detail.
-- These fields exist on job_orders but were omitted from the view.

DROP VIEW IF EXISTS schedule_board_view CASCADE;

CREATE VIEW schedule_board_view AS
SELECT
  jo.id,
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
  op.full_name       AS operator_name,
  hp.full_name       AS helper_name,
  creator.full_name  AS created_by_name,
  (SELECT COUNT(*) FROM job_notes jn WHERE jn.job_order_id = jo.id) AS notes_count,
  (0)::bigint        AS pending_change_requests_count
FROM job_orders jo
LEFT JOIN profiles op      ON jo.assigned_to        = op.id
LEFT JOIN profiles hp      ON jo.helper_assigned_to = hp.id
LEFT JOIN profiles creator ON jo.created_by         = creator.id
WHERE jo.deleted_at IS NULL;
