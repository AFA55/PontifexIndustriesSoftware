-- ============================================================
-- Migration: Equipment Confirmation + Job Survey
-- Date: 2026-03-14
--
-- 1. Add equipment_confirmed_by UUID[] to job_orders
--    Tracks which operators have already confirmed equipment.
--    On first assignment the operator must check off equipment;
--    on subsequent days (or if they come back) the checklist is skipped.
--
-- 2. Add job_survey JSONB to job_orders
--    Stores the smart survey (helper rating, equipment questions, etc.)
--    submitted after work-performed and before job completion.
--
-- 3. Recreate active_job_orders view with new columns
-- 4. Recreate schedule_board_view with equipment_confirmed_by
-- ============================================================

-- ============================================================
-- 1. ADD NEW COLUMNS
-- ============================================================

ALTER TABLE public.job_orders
  ADD COLUMN IF NOT EXISTS equipment_confirmed_by UUID[] DEFAULT '{}';

ALTER TABLE public.job_orders
  ADD COLUMN IF NOT EXISTS job_survey JSONB;

-- ============================================================
-- 2. RECREATE active_job_orders VIEW
-- ============================================================

DROP VIEW IF EXISTS public.active_job_orders;
CREATE VIEW public.active_job_orders
WITH (security_invoker = true)
AS
SELECT
  jo.id,
  jo.job_number,
  jo.title,
  jo.customer_name,
  jo.customer_contact,
  jo.job_type,
  jo.location,
  jo.address,
  jo.description,
  jo.assigned_to,
  jo.foreman_name,
  jo.foreman_phone,
  jo.salesman_name,
  jo.status,
  jo.priority,
  jo.scheduled_date,
  jo.end_date,
  jo.arrival_time,
  jo.estimated_hours,
  jo.assigned_at,
  jo.route_started_at,
  jo.work_started_at,
  jo.work_completed_at,
  jo.drive_time,
  jo.production_time,
  jo.total_time,
  jo.required_documents,
  jo.equipment_needed,
  jo.special_equipment,
  jo.mandatory_equipment,
  jo.job_site_number,
  jo.po_number,
  jo.customer_job_number,
  jo.work_performed,
  jo.materials_used,
  jo.equipment_used,
  jo.operator_notes,
  jo.issues_encountered,
  jo.customer_signature,
  jo.customer_signed_at,
  jo.photo_urls,
  jo.route_start_latitude,
  jo.route_start_longitude,
  jo.work_start_latitude,
  jo.work_start_longitude,
  jo.work_end_latitude,
  jo.work_end_longitude,
  jo.was_on_time,
  jo.within_estimated_hours,
  jo.customer_satisfied,
  jo.created_by,
  jo.created_at,
  jo.updated_at,
  jo.deleted_at,
  jo.deleted_by,
  jo.work_area_accessibility_rating,
  jo.work_area_accessibility_notes,
  jo.work_area_accessibility_submitted_at,
  jo.work_area_accessibility_submitted_by,
  jo.shop_arrival_time,
  jo.dispatched_at,
  jo.helper_assigned_to,
  jo.is_will_call,
  jo.difficulty_rating,
  jo.estimated_cost,
  jo.scheduling_flexibility,
  jo.equipment_confirmed_by,
  jo.job_survey,
  -- Operator profile (assigned technician)
  p.full_name  AS operator_name,
  p.email      AS operator_email,
  p.phone      AS operator_phone,
  -- Helper profile
  hp.full_name AS helper_name,
  -- Readable status
  CASE
    WHEN jo.work_completed_at IS NOT NULL THEN 'Completed'
    WHEN jo.work_started_at   IS NOT NULL THEN 'In Progress'
    WHEN jo.route_started_at  IS NOT NULL THEN 'In Route'
    WHEN jo.assigned_at       IS NOT NULL THEN 'Assigned'
    ELSE 'Scheduled'
  END AS readable_status,
  -- Calculated hours
  ROUND((jo.drive_time::DECIMAL      / 60), 2) AS drive_hours,
  ROUND((jo.production_time::DECIMAL / 60), 2) AS production_hours,
  ROUND((jo.total_time::DECIMAL      / 60), 2) AS total_hours,
  -- Creator profile (admin/salesman who created the ticket)
  cp.full_name AS created_by_name,
  cp.email     AS created_by_email
FROM public.job_orders jo
LEFT JOIN public.profiles p  ON p.id  = jo.assigned_to
LEFT JOIN public.profiles hp ON hp.id = jo.helper_assigned_to
LEFT JOIN public.profiles cp ON cp.id = jo.created_by
WHERE jo.deleted_at IS NULL
ORDER BY
  CASE jo.status
    WHEN 'in_progress' THEN 1
    WHEN 'in_route'    THEN 2
    WHEN 'assigned'    THEN 3
    WHEN 'scheduled'   THEN 4
    WHEN 'completed'   THEN 5
    ELSE 6
  END,
  jo.scheduled_date,
  jo.created_at DESC;

-- ============================================================
-- 3. RECREATE schedule_board_view WITH equipment_confirmed_by
-- ============================================================

DROP VIEW IF EXISTS public.schedule_board_view;
CREATE VIEW public.schedule_board_view
WITH (security_invoker = true)
AS
SELECT
  jo.id,
  jo.job_number,
  jo.title,
  jo.customer_name,
  jo.customer_contact,
  jo.job_type,
  jo.location,
  jo.address,
  jo.description,
  jo.status,
  jo.priority,
  jo.scheduled_date,
  jo.end_date,
  jo.arrival_time,
  jo.shop_arrival_time,
  jo.estimated_hours,
  jo.equipment_needed,
  jo.special_equipment,
  jo.mandatory_equipment,
  jo.po_number,
  jo.is_will_call,
  jo.difficulty_rating,
  jo.salesman_name,
  jo.assigned_to,
  jo.helper_assigned_to,
  jo.estimated_cost,
  jo.scheduling_flexibility,
  jo.dispatched_at,
  jo.equipment_confirmed_by,
  jo.created_at,
  jo.updated_at,
  op.full_name AS operator_name,
  hp.full_name AS helper_name,
  COALESCE(nc.note_count, 0)::integer AS notes_count,
  COALESCE(cr.change_request_count, 0)::integer AS pending_change_requests_count
FROM public.job_orders jo
LEFT JOIN public.profiles op ON jo.assigned_to = op.id
LEFT JOIN public.profiles hp ON jo.helper_assigned_to = hp.id
LEFT JOIN (
  SELECT job_order_id, COUNT(*) AS note_count
  FROM public.job_notes
  GROUP BY job_order_id
) nc ON nc.job_order_id = jo.id
LEFT JOIN (
  SELECT job_order_id, COUNT(*) AS change_request_count
  FROM public.schedule_change_requests
  WHERE status = 'pending'
  GROUP BY job_order_id
) cr ON cr.job_order_id = jo.id
WHERE jo.deleted_at IS NULL;
