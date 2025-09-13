import { NextResponse } from 'next/server';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export async function GET() {
  try {
    if (!isSupabaseConfigured() || !supabase) {
      return NextResponse.json({
        error: 'Supabase not configured',
        message: 'Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables',
        mode: 'localStorage'
      }, { status: 400 });
    }

    // Check if equipment table exists by trying to select from it
    const { data: tables, error } = await supabase
      .from('equipment')
      .select('id')
      .limit(1);

    if (error) {
      if (error.message.includes('does not exist') || error.code === 'PGRST116') {
        return NextResponse.json({
          exists: false,
          message: 'Equipment table does not exist. Please create it using the SQL provided.',
          error: error.message,
          sql: getSetupSQL()
        }, { status: 404 });
      } else {
        return NextResponse.json({
          error: 'Database connection error',
          message: error.message,
          code: error.code
        }, { status: 500 });
      }
    }

    return NextResponse.json({
      exists: true,
      message: 'Equipment table exists and is accessible',
      recordCount: tables?.length || 0
    });
  } catch (error: any) {
    return NextResponse.json({
      error: 'Unexpected error',
      message: error.message
    }, { status: 500 });
  }
}

export async function POST() {
  try {
    if (!isSupabaseConfigured() || !supabase) {
      return NextResponse.json({
        error: 'Supabase not configured',
        message: 'Please set environment variables first'
      }, { status: 400 });
    }

    // Try to insert a test equipment record
    const testEquipment = {
      name: 'Test Equipment',
      brand_name: 'Test Brand',
      model_number: 'TEST-001',
      type: 'Test Tool',
      serial_number: `TEST-${Date.now()}`,
      status: 'Available',
      assigned_to: 'Shop',
      location: 'Test Location',
      notes: 'Test equipment created by setup function',
      usage_hours: 0
    };

    const { data, error } = await supabase
      .from('equipment')
      .insert([testEquipment])
      .select()
      .single();

    if (error) {
      if (error.message.includes('does not exist')) {
        return NextResponse.json({
          success: false,
          message: 'Table does not exist. Please create it manually in Supabase dashboard.',
          sql: getSetupSQL()
        }, { status: 404 });
      } else {
        return NextResponse.json({
          success: false,
          message: `Database error: ${error.message}`,
          code: error.code
        }, { status: 400 });
      }
    }

    return NextResponse.json({
      success: true,
      message: '✅ Database connection successful! Test equipment added.',
      equipment: data
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      message: `Error: ${error.message}`
    }, { status: 500 });
  }
}

function getSetupSQL() {
  return `-- Pontifex Industries Equipment Management - Database Setup
-- Run this SQL in your Supabase SQL Editor

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

-- Enable Row Level Security (RLS)
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations (for development/demo purposes)
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
  ('Jackhammer TE3000', 'Hilti', 'TE-3000', 'Jackhammer', 'TJ-3000-001', 'Maintenance', 'Shop', 'Service Bay 1', 'Needs new bits and oil change', 890)
ON CONFLICT (serial_number) DO NOTHING;`;
}