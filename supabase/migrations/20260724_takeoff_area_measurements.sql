-- Takeoffs — area measure mode (Batch 1 measuring upgrade).
-- Adds raw_area_pt so a polygon's scale-free area survives recalibration as a
-- single multiply (mirrors raw_length_pt for linear). Additive + idempotent;
-- existing polyline/count rows are untouched (raw_area_pt stays NULL for them).
-- takeoff_conditions.measure_type already allows 'area' and unit allows 'SF'.

ALTER TABLE public.takeoff_measurements
  ADD COLUMN IF NOT EXISTS raw_area_pt numeric;
