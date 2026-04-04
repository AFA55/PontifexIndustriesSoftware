-- Migration: Fix schedule_board_view — add missing tenant_id, salesman_name, scheduled_end_date columns
--
-- Root cause: The view was created without tenant_id, salesman_name, or scheduled_end_date,
-- even though job_orders has all three. The API route filtered by .eq('tenant_id', tenantId)
-- which caused PostgREST to return a column-not-found error, resulting in HTTP 500 and
-- the frontend showing "Failed to fetch" on the schedule board.
--
-- Fix: DROP and recreate the view with all missing columns included.

DROP VIEW IF EXISTS schedule_board_view CASCADE;

CREATE VIEW schedule_board_view AS
SELECT
  jo.id,
  jo.job_number,
  jo.title,
  jo.customer_name,
  jo.job_type,
  jo.location,
  jo.address,
  jo.status,
  jo.priority,
  jo.scheduled_date,
  jo.scheduled_end_date,
  jo.end_date,
  jo.arrival_time,
  jo.shop_arrival_time,
  jo.equipment_needed,
  jo.is_will_call,
  jo.assigned_to,
  jo.helper_assigned_to,
  jo.estimated_hours,
  jo.estimated_cost,
  jo.description,
  jo.difficulty_rating,
  jo.created_via,
  jo.created_at,
  jo.project_name,
  jo.facility_id,
  jo.rejection_reason,
  jo.rejection_notes,
  jo.rejected_at,
  jo.tenant_id,
  jo.salesman_name,
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
