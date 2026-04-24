ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS ppe_required JSONB DEFAULT '[]'::jsonb;
COMMENT ON COLUMN job_orders.ppe_required IS 'Array of PPE items required for the job, e.g. ["safety_harness","gloves_cut_4","safety_glasses"]';
