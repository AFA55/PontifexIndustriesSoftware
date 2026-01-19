-- ============================================================================
-- OPERATOR PERFORMANCE TRACKING - MINIMAL SETUP
-- JUST TABLES, NO TRIGGERS, NO COMPLEX LOGIC
-- ============================================================================

-- Table 1: Operator Performance Metrics
-- Tracks overall performance stats for each operator
CREATE TABLE IF NOT EXISTS operator_performance_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID NOT NULL REFERENCES auth.users(id),

  -- Production Metrics
  total_jobs_completed INTEGER DEFAULT 0,
  total_linear_feet_cut DECIMAL(10,2) DEFAULT 0,
  total_hours_worked DECIMAL(10,2) DEFAULT 0,
  avg_linear_feet_per_hour DECIMAL(10,2) DEFAULT 0,

  -- Safety Metrics
  safety_incidents INTEGER DEFAULT 0,
  safety_score DECIMAL(5,2) DEFAULT 100.00, -- out of 100
  days_since_last_incident INTEGER DEFAULT 0,

  -- Quality Metrics
  customer_satisfaction_avg DECIMAL(3,2) DEFAULT 0, -- out of 5.0
  total_customer_ratings INTEGER DEFAULT 0,
  rework_incidents INTEGER DEFAULT 0,

  -- Cost Metrics
  jobs_on_budget INTEGER DEFAULT 0,
  jobs_over_budget INTEGER DEFAULT 0,
  avg_cost_variance_percent DECIMAL(5,2) DEFAULT 0,

  -- Timestamps
  last_job_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure one record per operator
  UNIQUE(operator_id)
);

-- Table 2: Operator Skills
-- Tracks proficiency level for different work types
CREATE TABLE IF NOT EXISTS operator_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID NOT NULL REFERENCES auth.users(id),

  -- Work Type
  work_type TEXT NOT NULL, -- e.g., 'wall_saw', 'core_drill', 'slab_saw', 'hand_saw'

  -- Proficiency Metrics
  proficiency_level INTEGER DEFAULT 1, -- 1=Beginner, 2=Intermediate, 3=Advanced, 4=Expert, 5=Master
  jobs_completed INTEGER DEFAULT 0,
  total_hours DECIMAL(10,2) DEFAULT 0,
  avg_productivity DECIMAL(10,2) DEFAULT 0, -- linear feet per hour for this work type
  success_rate DECIMAL(5,2) DEFAULT 100.00, -- percentage of jobs completed successfully

  -- Quality for this work type
  avg_customer_rating DECIMAL(3,2) DEFAULT 0, -- out of 5.0
  total_ratings INTEGER DEFAULT 0,

  -- Timestamps
  last_performed_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure one record per operator per work type
  UNIQUE(operator_id, work_type)
);

-- Table 3: Operator Job History
-- Tracks individual job performance for detailed analytics
CREATE TABLE IF NOT EXISTS operator_job_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID NOT NULL REFERENCES auth.users(id),
  job_id UUID NOT NULL REFERENCES job_orders(id),

  -- Job Performance
  work_type TEXT,
  linear_feet_cut DECIMAL(10,2) DEFAULT 0,
  hours_worked DECIMAL(10,2) DEFAULT 0,
  productivity_rate DECIMAL(10,2) DEFAULT 0, -- linear feet per hour

  -- Quality
  customer_rating INTEGER, -- 1-5 stars
  had_rework BOOLEAN DEFAULT FALSE,
  had_safety_incident BOOLEAN DEFAULT FALSE,

  -- Cost
  estimated_cost DECIMAL(10,2),
  actual_cost DECIMAL(10,2),
  cost_variance_percent DECIMAL(5,2),
  finished_on_budget BOOLEAN,

  -- Timestamps
  job_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure one record per operator per job
  UNIQUE(operator_id, job_id)
);

-- Create indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_operator_performance_operator_id ON operator_performance_metrics(operator_id);
CREATE INDEX IF NOT EXISTS idx_operator_skills_operator_id ON operator_skills(operator_id);
CREATE INDEX IF NOT EXISTS idx_operator_skills_work_type ON operator_skills(work_type);
CREATE INDEX IF NOT EXISTS idx_operator_job_history_operator_id ON operator_job_history(operator_id);
CREATE INDEX IF NOT EXISTS idx_operator_job_history_job_id ON operator_job_history(job_id);
CREATE INDEX IF NOT EXISTS idx_operator_job_history_date ON operator_job_history(job_date DESC);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON operator_performance_metrics TO authenticated;
GRANT SELECT, INSERT, UPDATE ON operator_skills TO authenticated;
GRANT SELECT, INSERT, UPDATE ON operator_job_history TO authenticated;

SELECT 'SUCCESS! Operator performance tracking tables created!' as status;
