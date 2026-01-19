/**
 * Test Equipment Usage Data
 *
 * This inserts sample equipment usage data to populate the Equipment Performance Dashboard
 * Run this in your Supabase SQL Editor
 */

-- First, let's get some job_order_id and operator_id values to use
-- You'll need to replace these with actual IDs from your database

-- Insert test equipment usage data
-- Note: Replace the job_order_id and operator_id with actual UUIDs from your database

-- Example 1: Hand Saw - Easy Job
INSERT INTO equipment_usage (
  job_order_id,
  operator_id,
  equipment_type,
  equipment_id,
  linear_feet_cut,
  task_type,
  difficulty_level,
  difficulty_notes,
  blade_type,
  blades_used,
  blade_wear_notes,
  hydraulic_hose_used_ft,
  water_hose_used_ft,
  power_hours,
  location_changes,
  setup_time_minutes,
  notes
) VALUES
-- Get first job and first operator with role operator
(
  (SELECT id FROM job_orders LIMIT 1),
  (SELECT id FROM profiles WHERE role = 'operator' LIMIT 1),
  'hand_saw',
  'HS-001',
  150.50,
  'hand_sawing',
  'easy',
  'Open parking lot, easy access',
  '14-inch diamond',
  2,
  '1 blade 75% worn, 1 blade 25% worn',
  50.0,
  75.0,
  2.5,
  3,
  180.0,
  'Quick job, good conditions'
);

-- Example 2: Wall Saw - Hard Job
INSERT INTO equipment_usage (
  job_order_id,
  operator_id,
  equipment_type,
  equipment_id,
  linear_feet_cut,
  task_type,
  difficulty_level,
  difficulty_notes,
  blade_type,
  blades_used,
  blade_wear_notes,
  hydraulic_hose_used_ft,
  water_hose_used_ft,
  power_hours,
  location_changes,
  setup_time_minutes,
  notes
) VALUES
(
  (SELECT id FROM job_orders LIMIT 1 OFFSET 0),
  (SELECT id FROM profiles WHERE role = 'operator' LIMIT 1 OFFSET 0),
  'wall_saw',
  'WS-003',
  85.25,
  'wall_sawing',
  'hard',
  'Tight basement, thick rebar throughout',
  '16-inch diamond',
  3,
  '2 blades fully worn, 1 blade 50% worn',
  120.0,
  150.0,
  4.5,
  5,
  240.0,
  'Challenging access, heavy rebar'
);

-- Example 3: Core Drill - Medium Job
INSERT INTO equipment_usage (
  job_order_id,
  operator_id,
  equipment_type,
  equipment_id,
  linear_feet_cut,
  task_type,
  difficulty_level,
  difficulty_notes,
  blade_type,
  blades_used,
  blade_wear_notes,
  hydraulic_hose_used_ft,
  water_hose_used_ft,
  power_hours,
  location_changes,
  setup_time_minutes,
  notes
) VALUES
(
  (SELECT id FROM job_orders LIMIT 1 OFFSET 0),
  (SELECT id FROM profiles WHERE role = 'operator' LIMIT 1 OFFSET 0),
  'core_drill',
  'CD-005',
  200.0,
  'core_drilling',
  'medium',
  'Standard commercial building',
  '8-inch core bit',
  1,
  '1 bit 40% worn',
  80.0,
  100.0,
  3.0,
  4,
  150.0,
  'Multiple cores through 6-inch slab'
);

-- Example 4: Brokk - Extreme Job
INSERT INTO equipment_usage (
  job_order_id,
  operator_id,
  equipment_type,
  equipment_id,
  linear_feet_cut,
  task_type,
  difficulty_level,
  difficulty_notes,
  blade_type,
  blades_used,
  blade_wear_notes,
  hydraulic_hose_used_ft,
  water_hose_used_ft,
  power_hours,
  location_changes,
  setup_time_minutes,
  notes
) VALUES
(
  (SELECT id FROM job_orders LIMIT 1 OFFSET 0),
  (SELECT id FROM profiles WHERE role = 'operator' LIMIT 1 OFFSET 0),
  'brokk',
  'BROKK-001',
  45.0,
  'demolition',
  'extreme',
  'Confined space, overhead work, extreme access difficulty',
  'Heavy duty breaker',
  0,
  'N/A - demolition hammer',
  200.0,
  50.0,
  6.0,
  8,
  360.0,
  'Very difficult job, required multiple repositions'
);

-- Example 5: Slab Saw - Easy Job
INSERT INTO equipment_usage (
  job_order_id,
  operator_id,
  equipment_type,
  equipment_id,
  linear_feet_cut,
  task_type,
  difficulty_level,
  difficulty_notes,
  blade_type,
  blades_used,
  blade_wear_notes,
  hydraulic_hose_used_ft,
  water_hose_used_ft,
  power_hours,
  location_changes,
  setup_time_minutes,
  notes
) VALUES
(
  (SELECT id FROM job_orders LIMIT 1 OFFSET 0),
  (SELECT id FROM profiles WHERE role = 'operator' LIMIT 1 OFFSET 0),
  'slab_saw',
  'SS-002',
  320.75,
  'slab_sawing',
  'easy',
  'New construction, clean slab, no obstacles',
  '20-inch diamond',
  1,
  '1 blade 30% worn',
  40.0,
  120.0,
  2.0,
  2,
  90.0,
  'Fast and efficient cut'
);

-- Example 6: Wire Saw - Hard Job
INSERT INTO equipment_usage (
  job_order_id,
  operator_id,
  equipment_type,
  equipment_id,
  linear_feet_cut,
  task_type,
  difficulty_level,
  difficulty_notes,
  blade_type,
  blades_used,
  blade_wear_notes,
  hydraulic_hose_used_ft,
  water_hose_used_ft,
  power_hours,
  location_changes,
  setup_time_minutes,
  notes
) VALUES
(
  (SELECT id FROM job_orders LIMIT 1 OFFSET 0),
  (SELECT id FROM profiles WHERE role = 'operator' LIMIT 1 OFFSET 0),
  'wire_saw',
  'WIRE-004',
  65.0,
  'wire_sawing',
  'hard',
  'Heavy reinforced concrete bridge section',
  'Diamond wire',
  1,
  'Wire worn 60%',
  150.0,
  180.0,
  5.5,
  6,
  300.0,
  'Bridge demolition, very thick concrete with heavy rebar'
);

-- Example 7: Hand Saw - Medium Job
INSERT INTO equipment_usage (
  job_order_id,
  operator_id,
  equipment_type,
  equipment_id,
  linear_feet_cut,
  task_type,
  difficulty_level,
  difficulty_notes,
  blade_type,
  blades_used,
  blade_wear_notes,
  hydraulic_hose_used_ft,
  water_hose_used_ft,
  power_hours,
  location_changes,
  setup_time_minutes,
  notes
) VALUES
(
  (SELECT id FROM job_orders LIMIT 1 OFFSET 0),
  (SELECT id FROM profiles WHERE role = 'operator' LIMIT 1 OFFSET 0),
  'hand_saw',
  'HS-002',
  95.0,
  'hand_sawing',
  'medium',
  'Interior cuts, some tight corners',
  '12-inch concrete blade',
  2,
  '1 blade fully worn, 1 blade 20% worn',
  60.0,
  90.0,
  1.5,
  4,
  120.0,
  'Interior renovation work'
);

-- Example 8: Mini X - Medium Job
INSERT INTO equipment_usage (
  job_order_id,
  operator_id,
  equipment_type,
  equipment_id,
  linear_feet_cut,
  task_type,
  difficulty_level,
  difficulty_notes,
  blade_type,
  blades_used,
  blade_wear_notes,
  hydraulic_hose_used_ft,
  water_hose_used_ft,
  power_hours,
  location_changes,
  setup_time_minutes,
  notes
) VALUES
(
  (SELECT id FROM job_orders LIMIT 1 OFFSET 0),
  (SELECT id FROM profiles WHERE role = 'operator' LIMIT 1 OFFSET 0),
  'mini_x',
  'MINI-X-001',
  30.0,
  'breaking',
  'medium',
  'Sidewalk removal, standard conditions',
  'Breaker attachment',
  0,
  'N/A',
  100.0,
  25.0,
  3.5,
  5,
  180.0,
  'Sidewalk and curb removal'
);

-- Example 9: Slab Saw - Hard Job
INSERT INTO equipment_usage (
  job_order_id,
  operator_id,
  equipment_type,
  equipment_id,
  linear_feet_cut,
  task_type,
  difficulty_level,
  difficulty_notes,
  blade_type,
  blades_used,
  blade_wear_notes,
  hydraulic_hose_used_ft,
  water_hose_used_ft,
  power_hours,
  location_changes,
  setup_time_minutes,
  notes
) VALUES
(
  (SELECT id FROM job_orders LIMIT 1 OFFSET 0),
  (SELECT id FROM profiles WHERE role = 'operator' LIMIT 1 OFFSET 0),
  'slab_saw',
  'SS-001',
  180.0,
  'slab_sawing',
  'hard',
  '8-inch thick slab with wire mesh and rebar',
  '24-inch diamond',
  3,
  '2 blades fully worn, 1 blade 70% worn',
  80.0,
  200.0,
  4.0,
  7,
  280.0,
  'Very thick slab, multiple blade changes required'
);

-- Example 10: Core Drill - Easy Job
INSERT INTO equipment_usage (
  job_order_id,
  operator_id,
  equipment_type,
  equipment_id,
  linear_feet_cut,
  task_type,
  difficulty_level,
  difficulty_notes,
  blade_type,
  blades_used,
  blade_wear_notes,
  hydraulic_hose_used_ft,
  water_hose_used_ft,
  power_hours,
  location_changes,
  setup_time_minutes,
  notes
) VALUES
(
  (SELECT id FROM job_orders LIMIT 1 OFFSET 0),
  (SELECT id FROM profiles WHERE role = 'operator' LIMIT 1 OFFSET 0),
  'core_drill',
  'CD-002',
  125.0,
  'core_drilling',
  'easy',
  'Residential driveway, 4-inch slab',
  '6-inch core bit',
  1,
  '1 bit 20% worn',
  40.0,
  60.0,
  1.5,
  2,
  60.0,
  'Quick residential job, multiple small cores'
);

-- Verify the data was inserted
SELECT
  equipment_type,
  difficulty_level,
  linear_feet_cut,
  blades_used,
  power_hours,
  created_at
FROM equipment_usage
ORDER BY created_at DESC
LIMIT 10;

-- Show summary statistics
SELECT
  COUNT(*) as total_entries,
  SUM(linear_feet_cut) as total_linear_feet,
  SUM(blades_used) as total_blades,
  SUM(power_hours) as total_power_hours,
  AVG(feet_per_hour) as avg_production_rate
FROM equipment_usage;
