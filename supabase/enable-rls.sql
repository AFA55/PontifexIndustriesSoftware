-- Enable Row Level Security and set up permissions for development
-- Run this in your Supabase SQL Editor after running equipment-schema.sql

-- Enable RLS on equipment table
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_history ENABLE ROW LEVEL SECURITY;

-- Grant permissions to anon and authenticated users (for development)
GRANT ALL ON equipment TO anon;
GRANT ALL ON equipment TO authenticated;
GRANT ALL ON equipment_history TO anon;
GRANT ALL ON equipment_history TO authenticated;

-- Grant usage on sequences (needed for UUID generation)
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Create permissive policies for development (you should restrict these in production)
CREATE POLICY "Enable all for equipment" ON equipment
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Enable all for equipment_history" ON equipment_history
  FOR ALL USING (true) WITH CHECK (true);

-- Alternative: More restrictive policies for production
-- Uncomment these and comment out the permissive policies above when going to production

-- CREATE POLICY "Anyone can read equipment" ON equipment
--   FOR SELECT USING (true);

-- CREATE POLICY "Anyone can insert equipment" ON equipment  
--   FOR INSERT WITH CHECK (true);

-- CREATE POLICY "Anyone can update equipment" ON equipment
--   FOR UPDATE USING (true);

-- CREATE POLICY "Anyone can read equipment history" ON equipment_history
--   FOR SELECT USING (true);

-- CREATE POLICY "Anyone can insert equipment history" ON equipment_history
--   FOR INSERT WITH CHECK (true);