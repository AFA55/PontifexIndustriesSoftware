-- Pontifex Industries Equipment Management - Database Setup
-- Run this script in your Supabase SQL Editor to create the equipment table

-- Create equipment table
CREATE TABLE IF NOT EXISTS equipment (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  brand_name TEXT,
  model_number TEXT,
  type TEXT NOT NULL,
  serial_number TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'Available' CHECK (status IN ('Available', 'In Use', 'Maintenance', 'Out of Service')),
  assigned_to TEXT DEFAULT 'Unassigned',
  location TEXT,
  last_service_date DATE,
  next_service_due DATE,
  notes TEXT,
  qr_code_url TEXT,
  usage_hours INTEGER DEFAULT 0,
  equipment_image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_equipment_status ON equipment(status);
CREATE INDEX IF NOT EXISTS idx_equipment_assigned_to ON equipment(assigned_to);
CREATE INDEX IF NOT EXISTS idx_equipment_serial ON equipment(serial_number);
CREATE INDEX IF NOT EXISTS idx_equipment_type ON equipment(type);
CREATE INDEX IF NOT EXISTS idx_equipment_name ON equipment(name);

-- Enable Row Level Security (RLS)
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations (for development/demo purposes)
-- In production, you may want to create more restrictive policies
CREATE POLICY "Enable all access for equipment" ON equipment
  FOR ALL USING (true) WITH CHECK (true);

-- Function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at on equipment table
DROP TRIGGER IF EXISTS update_equipment_updated_at ON equipment;
CREATE TRIGGER update_equipment_updated_at
    BEFORE UPDATE ON equipment
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Insert sample equipment data for testing
INSERT INTO equipment (name, brand_name, model_number, type, serial_number, status, assigned_to, location, notes, usage_hours)
VALUES
  ('Core Drill CD250', 'Hilti', 'DD250', 'Core Drill', 'CD250-001', 'Available', 'Matt M', 'West Warehouse', 'Heavy duty core drill for concrete', 120),
  ('Diesel Slab Saw', 'Husqvarna', 'FS5000', 'Floor Saw', 'DSS-5000-001', 'In Use', 'Skinny H', 'Job Site Alpha', 'Diesel powered, 48" blade capacity', 340),
  ('Floor Saw FS400', 'Stihl', 'FS400', 'Floor Saw', 'FS400-002', 'Available', 'Rex Z', 'East Storage', 'Walk-behind saw for asphalt and concrete', 180),
  ('Jackhammer TE3000', 'Hilti', 'TE-3000', 'Jackhammer', 'TJ-3000-001', 'Maintenance', 'Shop', 'Service Bay 1', 'Needs new bits and oil change', 890),
  ('Wall Saw WS440', 'Husqvarna', 'WS440', 'Wall Saw', 'WS440-003', 'Available', 'Brandon R', 'Main Shop', 'Track-mounted wall saw with hydraulic feed', 95),
  ('Hand Saw K970', 'Husqvarna', 'K970', 'Hand Saw', 'K970-004', 'In Use', 'Rex Z', 'Site #142', 'Gas-powered handheld saw for cutting operations', 220),
  ('Ring Saw K6500', 'Husqvarna', 'K6500', 'Ring Saw', 'K6500-005', 'Available', 'Shop', 'Equipment Rack A', 'Electric ring saw for precise cuts', 45),
  ('Generator GP7500', 'Honda', 'GP7500E', 'Generator', 'GP7500-006', 'Available', 'Matt M', 'Generator Bay', '7500W portable generator with electric start', 67)
ON CONFLICT (serial_number) DO NOTHING;

-- Create equipment_notes table for tracking maintenance and usage notes
CREATE TABLE IF NOT EXISTS equipment_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  equipment_id UUID REFERENCES equipment(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  author TEXT NOT NULL,
  note_type TEXT DEFAULT 'general' CHECK (note_type IN ('general', 'maintenance', 'usage', 'issue', 'repair')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for equipment_notes
CREATE INDEX IF NOT EXISTS idx_equipment_notes_equipment_id ON equipment_notes(equipment_id);
CREATE INDEX IF NOT EXISTS idx_equipment_notes_type ON equipment_notes(note_type);

-- Insert sample notes
INSERT INTO equipment_notes (equipment_id, note, author, note_type)
SELECT
  e.id,
  'Equipment checked and ready for deployment',
  'Shop Supervisor',
  'maintenance'
FROM equipment e
WHERE e.serial_number = 'CD250-001'
ON CONFLICT DO NOTHING;

INSERT INTO equipment_notes (equipment_id, note, author, note_type)
SELECT
  e.id,
  'Blade changed, oil topped off. Running smoothly.',
  'Rex Z',
  'maintenance'
FROM equipment e
WHERE e.serial_number = 'DSS-5000-001'
ON CONFLICT DO NOTHING;

-- Create maintenance_records table
CREATE TABLE IF NOT EXISTS maintenance_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  equipment_id UUID REFERENCES equipment(id) ON DELETE CASCADE,
  service_type TEXT NOT NULL,
  description TEXT NOT NULL,
  technician TEXT NOT NULL,
  cost DECIMAL(10,2),
  service_date DATE NOT NULL DEFAULT CURRENT_DATE,
  parts_used TEXT[],
  next_service_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for maintenance_records
CREATE INDEX IF NOT EXISTS idx_maintenance_records_equipment_id ON maintenance_records(equipment_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_records_service_date ON maintenance_records(service_date);

-- Insert sample maintenance record
INSERT INTO maintenance_records (equipment_id, service_type, description, technician, cost, service_date, parts_used)
SELECT
  e.id,
  'Routine Service',
  'Oil change, filter replacement, general inspection',
  'Mike Johnson',
  125.50,
  CURRENT_DATE - INTERVAL '30 days',
  ARRAY['Oil Filter', 'Engine Oil', 'Air Filter']
FROM equipment e
WHERE e.serial_number = 'TJ-3000-001'
ON CONFLICT DO NOTHING;

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Pontifex Equipment Management database setup completed successfully!';
  RAISE NOTICE 'Tables created: equipment, equipment_notes, maintenance_records';
  RAISE NOTICE 'Sample data inserted for testing purposes';
END $$;