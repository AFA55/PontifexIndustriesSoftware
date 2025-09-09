-- Equipment Management Schema
-- Run this in your Supabase SQL Editor

-- Create equipment table
CREATE TABLE IF NOT EXISTS equipment (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    brand VARCHAR(255),
    model VARCHAR(255),
    serial_number VARCHAR(255) UNIQUE,
    qr_code VARCHAR(255) UNIQUE NOT NULL,
    status VARCHAR(50) DEFAULT 'available' CHECK (status IN ('available', 'assigned', 'maintenance')),
    assigned_to VARCHAR(255),
    assigned_at TIMESTAMP,
    location VARCHAR(255),
    notes TEXT,
    qr_image TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create equipment history table for audit trail
CREATE TABLE IF NOT EXISTS equipment_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    equipment_id UUID REFERENCES equipment(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL, -- 'created', 'assigned', 'returned', 'maintenance', 'updated'
    previous_status VARCHAR(50),
    new_status VARCHAR(50),
    assigned_to VARCHAR(255),
    assigned_from VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    user_id VARCHAR(255) -- Could be expanded for user management
);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_equipment_updated_at ON equipment;
CREATE TRIGGER update_equipment_updated_at
    BEFORE UPDATE ON equipment
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create function to log equipment changes
CREATE OR REPLACE FUNCTION log_equipment_changes()
RETURNS TRIGGER AS $$
BEGIN
    -- Log status changes
    IF OLD.status != NEW.status THEN
        INSERT INTO equipment_history (
            equipment_id,
            action,
            previous_status,
            new_status,
            assigned_to,
            assigned_from,
            notes
        ) VALUES (
            NEW.id,
            CASE 
                WHEN NEW.status = 'assigned' THEN 'assigned'
                WHEN NEW.status = 'available' AND OLD.status = 'assigned' THEN 'returned'
                WHEN NEW.status = 'maintenance' THEN 'maintenance'
                ELSE 'status_change'
            END,
            OLD.status,
            NEW.status,
            NEW.assigned_to,
            OLD.assigned_to,
            CASE 
                WHEN NEW.status = 'assigned' THEN 'Equipment assigned to ' || COALESCE(NEW.assigned_to, 'unknown')
                WHEN NEW.status = 'available' AND OLD.status = 'assigned' THEN 'Equipment returned from ' || COALESCE(OLD.assigned_to, 'unknown')
                WHEN NEW.status = 'maintenance' THEN 'Equipment sent to maintenance'
                ELSE 'Status changed from ' || OLD.status || ' to ' || NEW.status
            END
        );
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to log changes
DROP TRIGGER IF EXISTS log_equipment_changes_trigger ON equipment;
CREATE TRIGGER log_equipment_changes_trigger
    AFTER UPDATE ON equipment
    FOR EACH ROW
    EXECUTE FUNCTION log_equipment_changes();

-- Create trigger to log new equipment
CREATE OR REPLACE FUNCTION log_equipment_creation()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO equipment_history (
        equipment_id,
        action,
        new_status,
        notes
    ) VALUES (
        NEW.id,
        'created',
        NEW.status,
        'Equipment ' || NEW.name || ' created with QR code ' || NEW.qr_code
    );
    
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS log_equipment_creation_trigger ON equipment;
CREATE TRIGGER log_equipment_creation_trigger
    AFTER INSERT ON equipment
    FOR EACH ROW
    EXECUTE FUNCTION log_equipment_creation();

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_equipment_qr_code ON equipment(qr_code);
CREATE INDEX IF NOT EXISTS idx_equipment_status ON equipment(status);
CREATE INDEX IF NOT EXISTS idx_equipment_assigned_to ON equipment(assigned_to);
CREATE INDEX IF NOT EXISTS idx_equipment_serial_number ON equipment(serial_number);
CREATE INDEX IF NOT EXISTS idx_equipment_history_equipment_id ON equipment_history(equipment_id);
CREATE INDEX IF NOT EXISTS idx_equipment_history_created_at ON equipment_history(created_at);

-- Sample data (optional - remove if you don't want sample data)
INSERT INTO equipment (name, brand, model, serial_number, qr_code, status, location, notes) VALUES
('Concrete Saw CS-450', 'DeWalt', 'DCS450B', 'DW-CS450-001', 'EQ-SAW-001', 'available', 'Tool Shed A', 'Primary concrete cutting saw'),
('Angle Grinder AG-200', 'Makita', '9557PBX1', 'MK-AG200-002', 'EQ-GRN-002', 'available', 'Tool Shed A', 'Heavy duty angle grinder'),
('Core Drill CD-300', 'Hilti', 'DD130', 'HI-CD300-003', 'EQ-DRL-003', 'maintenance', 'Maintenance Bay', 'Needs blade replacement'),
('Jackhammer JH-400', 'Bosch', '11335K', 'BS-JH400-004', 'EQ-JAK-004', 'assigned', 'Site B - Downtown', 'Assigned to Mike Johnson')
ON CONFLICT (qr_code) DO NOTHING;