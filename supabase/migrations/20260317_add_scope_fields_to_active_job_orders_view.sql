-- Add scope_details, scope_photo_urls, equipment_selections, equipment_rentals,
-- site_compliance, jobsite_conditions, additional_info, job_difficulty_rating
-- to active_job_orders view so operators and admins can see full job scope

DROP VIEW IF EXISTS public.active_job_orders CASCADE;

CREATE VIEW public.active_job_orders AS
SELECT jo.id,
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
    jo.is_multi_day,
    jo.total_days_worked,
    -- Scope and compliance fields for operator job detail + admin views
    jo.scope_details,
    jo.scope_photo_urls,
    jo.equipment_selections,
    jo.equipment_rentals,
    jo.site_compliance,
    jo.jobsite_conditions,
    jo.additional_info,
    jo.job_difficulty_rating,
    jo.site_contact_phone,
    p.full_name AS operator_name,
    p.email AS operator_email,
    p.phone AS operator_phone,
    hp.full_name AS helper_name,
    CASE
        WHEN jo.work_completed_at IS NOT NULL THEN 'Completed'
        WHEN jo.work_started_at IS NOT NULL THEN 'In Progress'
        WHEN jo.route_started_at IS NOT NULL THEN 'In Route'
        WHEN jo.assigned_at IS NOT NULL THEN 'Assigned'
        ELSE 'Scheduled'
    END AS readable_status,
    round(jo.drive_time::numeric / 60, 2) AS drive_hours,
    round(jo.production_time::numeric / 60, 2) AS production_hours,
    round(jo.total_time::numeric / 60, 2) AS total_hours,
    cp.full_name AS created_by_name,
    cp.email AS created_by_email
FROM job_orders jo
    LEFT JOIN profiles p ON p.id = jo.assigned_to
    LEFT JOIN profiles hp ON hp.id = jo.helper_assigned_to
    LEFT JOIN profiles cp ON cp.id = jo.created_by
WHERE jo.deleted_at IS NULL
ORDER BY (
    CASE jo.status
        WHEN 'in_progress' THEN 1
        WHEN 'in_route' THEN 2
        WHEN 'assigned' THEN 3
        WHEN 'scheduled' THEN 4
        WHEN 'completed' THEN 5
        ELSE 6
    END), jo.scheduled_date, jo.created_at DESC;
