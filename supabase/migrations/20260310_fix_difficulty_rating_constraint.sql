-- Fix job_difficulty_rating constraint to allow 1-10 (matching the form UI)
ALTER TABLE job_orders DROP CONSTRAINT IF EXISTS job_orders_job_difficulty_rating_check;
ALTER TABLE job_orders ADD CONSTRAINT job_orders_job_difficulty_rating_check CHECK (job_difficulty_rating >= 1 AND job_difficulty_rating <= 10);
