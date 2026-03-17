-- Recreate the function to auto-update total_days_worked on job_orders
-- when daily_job_logs are inserted or updated (upsert-safe)
-- Fix: original trigger only fired on INSERT, but daily-log API uses UPSERT

CREATE OR REPLACE FUNCTION update_total_days_worked()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.job_orders
  SET total_days_worked = (
    SELECT COUNT(DISTINCT log_date)
    FROM public.daily_job_logs
    WHERE job_order_id = NEW.job_order_id
  )
  WHERE id = NEW.job_order_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop old trigger if exists, create new one for both INSERT and UPDATE
DROP TRIGGER IF EXISTS trigger_update_total_days_worked ON public.daily_job_logs;

CREATE TRIGGER trigger_update_total_days_worked
  AFTER INSERT OR UPDATE ON public.daily_job_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_total_days_worked();
