ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS equipment_rental_flags JSONB DEFAULT '{}'::jsonb;
