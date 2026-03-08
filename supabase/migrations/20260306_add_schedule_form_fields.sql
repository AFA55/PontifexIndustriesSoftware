-- Schedule Form: Add new columns to job_orders for the digitized Job Scheduling Form
-- These columns support the 8-step wizard form

-- Jobsite conditions (checkboxes + footage values from paper form)
-- Stored as JSONB: { water_available, water_available_ft, water_control, manpower_provided,
--   scaffolding_provided, electricity_available, electricity_available_ft, inside_outside,
--   proper_ventilation, overcutting_allowed, cord_480, cord_480_ft, clean_up_required,
--   high_work, high_work_ft, hyd_hose, hyd_hose_ft, plastic_needed }
ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS jobsite_conditions JSONB DEFAULT '{}';

-- Site access & compliance
-- Stored as JSONB: { orientation_required, orientation_datetime, badging_required,
--   badging_type, special_instructions }
ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS site_compliance JSONB DEFAULT '{}';

-- Scheduling flexibility
-- Stored as JSONB: { special_arrival, special_arrival_time, can_work_fridays,
--   can_work_weekends, outside_hours, outside_hours_details }
ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS scheduling_flexibility JSONB DEFAULT '{}';

-- Estimated cost / quoted price
ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS estimated_cost DECIMAL(10,2);

-- Source tracking (which form created this job: 'quick_add' or 'schedule_form')
ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS created_via VARCHAR(50) DEFAULT 'quick_add';

-- Recreate the active view to include new columns
DROP VIEW IF EXISTS active_job_orders;
CREATE VIEW active_job_orders AS
SELECT * FROM job_orders WHERE deleted_at IS NULL;
