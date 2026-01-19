-- ============================================================================
-- OPERATOR METRICS AUTO-CALCULATION - ADD TRIGGERS
-- RUN AFTER OPERATOR_TRACKING_MINIMAL.sql
-- ============================================================================
-- This makes metrics update automatically when work is completed
-- ============================================================================

-- Function to update operator performance metrics when job history is added
CREATE OR REPLACE FUNCTION update_operator_performance_metrics()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert or update the operator's overall performance metrics
  INSERT INTO operator_performance_metrics (
    operator_id,
    total_jobs_completed,
    total_linear_feet_cut,
    total_hours_worked,
    avg_linear_feet_per_hour,
    safety_incidents,
    customer_satisfaction_avg,
    total_customer_ratings,
    rework_incidents,
    jobs_on_budget,
    jobs_over_budget,
    last_job_date,
    updated_at
  )
  SELECT
    NEW.operator_id,
    COUNT(*) as total_jobs,
    COALESCE(SUM(linear_feet_cut), 0) as total_feet,
    COALESCE(SUM(hours_worked), 0) as total_hours,
    CASE
      WHEN SUM(hours_worked) > 0 THEN ROUND(SUM(linear_feet_cut) / SUM(hours_worked), 2)
      ELSE 0
    END as avg_rate,
    COALESCE(SUM(CASE WHEN had_safety_incident THEN 1 ELSE 0 END), 0) as incidents,
    CASE
      WHEN COUNT(customer_rating) > 0 THEN ROUND(AVG(customer_rating), 2)
      ELSE 0
    END as avg_rating,
    COUNT(customer_rating) as total_ratings,
    COALESCE(SUM(CASE WHEN had_rework THEN 1 ELSE 0 END), 0) as reworks,
    COALESCE(SUM(CASE WHEN finished_on_budget = TRUE THEN 1 ELSE 0 END), 0) as on_budget,
    COALESCE(SUM(CASE WHEN finished_on_budget = FALSE THEN 1 ELSE 0 END), 0) as over_budget,
    MAX(job_date) as last_date,
    NOW()
  FROM operator_job_history
  WHERE operator_id = NEW.operator_id
  ON CONFLICT (operator_id)
  DO UPDATE SET
    total_jobs_completed = EXCLUDED.total_jobs_completed,
    total_linear_feet_cut = EXCLUDED.total_linear_feet_cut,
    total_hours_worked = EXCLUDED.total_hours_worked,
    avg_linear_feet_per_hour = EXCLUDED.avg_linear_feet_per_hour,
    safety_incidents = EXCLUDED.safety_incidents,
    customer_satisfaction_avg = EXCLUDED.customer_satisfaction_avg,
    total_customer_ratings = EXCLUDED.total_customer_ratings,
    rework_incidents = EXCLUDED.rework_incidents,
    jobs_on_budget = EXCLUDED.jobs_on_budget,
    jobs_over_budget = EXCLUDED.jobs_over_budget,
    last_job_date = EXCLUDED.last_job_date,
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update performance metrics when job history is added
DROP TRIGGER IF EXISTS trigger_update_operator_performance ON operator_job_history;
CREATE TRIGGER trigger_update_operator_performance
  AFTER INSERT OR UPDATE ON operator_job_history
  FOR EACH ROW
  EXECUTE FUNCTION update_operator_performance_metrics();

-- Function to update operator skills when job history is added
CREATE OR REPLACE FUNCTION update_operator_skills()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update if work_type is specified
  IF NEW.work_type IS NOT NULL THEN
    -- Insert or update the operator's skill for this work type
    INSERT INTO operator_skills (
      operator_id,
      work_type,
      jobs_completed,
      total_hours,
      avg_productivity,
      avg_customer_rating,
      total_ratings,
      last_performed_date,
      updated_at
    )
    SELECT
      NEW.operator_id,
      NEW.work_type,
      COUNT(*) as jobs,
      COALESCE(SUM(hours_worked), 0) as hours,
      CASE
        WHEN SUM(hours_worked) > 0 THEN ROUND(SUM(linear_feet_cut) / SUM(hours_worked), 2)
        ELSE 0
      END as productivity,
      CASE
        WHEN COUNT(customer_rating) > 0 THEN ROUND(AVG(customer_rating), 2)
        ELSE 0
      END as rating,
      COUNT(customer_rating) as ratings,
      MAX(job_date) as last_date,
      NOW()
    FROM operator_job_history
    WHERE operator_id = NEW.operator_id
      AND work_type = NEW.work_type
    ON CONFLICT (operator_id, work_type)
    DO UPDATE SET
      jobs_completed = EXCLUDED.jobs_completed,
      total_hours = EXCLUDED.total_hours,
      avg_productivity = EXCLUDED.avg_productivity,
      avg_customer_rating = EXCLUDED.avg_customer_rating,
      total_ratings = EXCLUDED.total_ratings,
      last_performed_date = EXCLUDED.last_performed_date,
      updated_at = NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update skills when job history is added
DROP TRIGGER IF EXISTS trigger_update_operator_skills ON operator_job_history;
CREATE TRIGGER trigger_update_operator_skills
  AFTER INSERT OR UPDATE ON operator_job_history
  FOR EACH ROW
  EXECUTE FUNCTION update_operator_skills();

-- Function to auto-update timestamps
CREATE OR REPLACE FUNCTION update_operator_tables_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for auto-updating timestamps
DROP TRIGGER IF EXISTS trigger_operator_performance_timestamp ON operator_performance_metrics;
CREATE TRIGGER trigger_operator_performance_timestamp
  BEFORE UPDATE ON operator_performance_metrics
  FOR EACH ROW
  EXECUTE FUNCTION update_operator_tables_timestamp();

DROP TRIGGER IF EXISTS trigger_operator_skills_timestamp ON operator_skills;
CREATE TRIGGER trigger_operator_skills_timestamp
  BEFORE UPDATE ON operator_skills
  FOR EACH ROW
  EXECUTE FUNCTION update_operator_tables_timestamp();

-- Add helpful comments
COMMENT ON TABLE operator_performance_metrics IS 'Auto-calculated overall performance metrics for each operator';
COMMENT ON TABLE operator_skills IS 'Auto-calculated skill proficiency by work type for each operator';
COMMENT ON TABLE operator_job_history IS 'Individual job records that trigger automatic metric updates';

SELECT 'SUCCESS! Operator metrics will now auto-calculate when jobs are completed!' as status;
