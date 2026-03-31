-- Add missing_info fields and created_by to schedule_board_view
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
  jo.additional_info,
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
  jo.equipment_selections,
  jo.equipment_rentals,
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
  jo.jobsite_conditions,
  jo.site_compliance,
  jo.scope_details,
  jo.created_by,
  jo.missing_info_items,
  jo.missing_info_note,
  jo.missing_info_flagged,
  jo.missing_info_flagged_at,
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
) cr ON cr.job_order_id = jo.id;
