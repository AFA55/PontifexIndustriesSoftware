-- Fix timecards_with_users view: add tenant_id and approval_status columns
-- These were missing, causing /api/admin/timecards to 500 when filtering by tenant or approval status

DROP VIEW IF EXISTS timecards_with_users;

CREATE VIEW timecards_with_users AS
 SELECT t.id,
    t.user_id,
    t.tenant_id,
    t.approval_status,
    p.full_name,
    p.email,
    p.role,
    p.hourly_rate,
    t.date,
    t.clock_in_time,
    t.clock_out_time,
    t.total_hours,
    t.labor_cost,
    t.clock_in_latitude,
    t.clock_in_longitude,
    t.clock_out_latitude,
    t.clock_out_longitude,
    t.notes,
    t.is_approved,
    t.is_shop_hours,
    t.is_night_shift,
    t.hour_type,
    t.clock_in_method,
    t.nfc_tag_id,
    t.nfc_tag_uid,
    t.remote_photo_url,
    t.remote_verified,
    t.approved_by,
    t.approved_at,
    approver.full_name AS approved_by_name,
    t.job_order_id,
    jo.job_number,
    jo.customer_name AS job_customer_name,
    jo.title AS job_title,
    jo.job_quote,
    jo.scheduled_date AS job_scheduled_date,
    nt.label AS nfc_tag_label,
    nt.tag_type AS nfc_tag_type,
    t.created_at,
    t.updated_at
   FROM timecards t
     LEFT JOIN profiles p ON t.user_id = p.id
     LEFT JOIN profiles approver ON t.approved_by = approver.id
     LEFT JOIN job_orders jo ON t.job_order_id = jo.id
     LEFT JOIN nfc_tags nt ON t.nfc_tag_id = nt.id;
