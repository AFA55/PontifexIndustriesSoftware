-- =====================================================
-- BLADE & BIT INVENTORY TRACKING SYSTEM
-- =====================================================
-- This migration creates a comprehensive system for tracking blades and bits
-- including inventory, assignments, usage tracking, and checkout history

-- =====================================================
-- 1. EQUIPMENT INVENTORY TABLE (Enhanced)
-- =====================================================
-- Add new columns to existing equipment table for blade/bit specific data
ALTER TABLE equipment
ADD COLUMN IF NOT EXISTS equipment_category VARCHAR(50), -- 'blade', 'bit', 'tool', etc.
ADD COLUMN IF NOT EXISTS manufacturer VARCHAR(100),
ADD COLUMN IF NOT EXISTS model_number VARCHAR(100),
ADD COLUMN IF NOT EXISTS size VARCHAR(50), -- e.g., "20 inch", "14 inch"
ADD COLUMN IF NOT EXISTS equipment_for VARCHAR(100), -- e.g., "slab saw", "hand saw", "flush cut", "wall saw", "chop saw"
ADD COLUMN IF NOT EXISTS purchase_price DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS purchase_date DATE,
ADD COLUMN IF NOT EXISTS qr_code_data TEXT, -- stores QR code data
ADD COLUMN IF NOT EXISTS unique_identification_code VARCHAR(100) UNIQUE, -- unique ID per blade
ADD COLUMN IF NOT EXISTS is_checked_out BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS total_usage_linear_feet DECIMAL(10,2) DEFAULT 0, -- tracks total linear feet cut
ADD COLUMN IF NOT EXISTS quantity_in_stock INTEGER DEFAULT 1, -- for inventory tracking
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_equipment_category ON equipment(equipment_category);
CREATE INDEX IF NOT EXISTS idx_equipment_qr_code ON equipment(qr_code_data);
CREATE INDEX IF NOT EXISTS idx_equipment_unique_id ON equipment(unique_identification_code);

-- =====================================================
-- 2. BLADE ASSIGNMENTS TABLE
-- =====================================================
-- Tracks when blades are assigned/checked out to operators
CREATE TABLE IF NOT EXISTS blade_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    equipment_id UUID REFERENCES equipment(id) ON DELETE CASCADE,
    operator_id UUID REFERENCES auth.users(id),
    assigned_by UUID REFERENCES auth.users(id), -- admin who assigned it
    assigned_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    returned_date TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) DEFAULT 'active', -- 'active', 'returned', 'damaged', 'lost'
    checkout_notes TEXT,
    return_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_blade_assignments_equipment ON blade_assignments(equipment_id);
CREATE INDEX IF NOT EXISTS idx_blade_assignments_operator ON blade_assignments(operator_id);
CREATE INDEX IF NOT EXISTS idx_blade_assignments_status ON blade_assignments(status);

-- =====================================================
-- 3. BLADE USAGE HISTORY TABLE
-- =====================================================
-- Tracks detailed usage of blades (linear feet cut, etc.)
CREATE TABLE IF NOT EXISTS blade_usage_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    equipment_id UUID REFERENCES equipment(id) ON DELETE CASCADE,
    job_order_id UUID REFERENCES job_orders(id),
    operator_id UUID REFERENCES auth.users(id),
    usage_date DATE DEFAULT CURRENT_DATE,
    linear_feet_cut DECIMAL(10,2) DEFAULT 0,
    work_performed_id UUID, -- reference to work_performed if applicable
    equipment_type_used VARCHAR(100), -- e.g., "hand saw", "slab saw"
    blade_size VARCHAR(50), -- e.g., "20 inch"
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_blade_usage_equipment ON blade_usage_history(equipment_id);
CREATE INDEX IF NOT EXISTS idx_blade_usage_job ON blade_usage_history(job_order_id);
CREATE INDEX IF NOT EXISTS idx_blade_usage_operator ON blade_usage_history(operator_id);
CREATE INDEX IF NOT EXISTS idx_blade_usage_date ON blade_usage_history(usage_date);

-- =====================================================
-- 4. EQUIPMENT CHECKOUT SESSIONS TABLE
-- =====================================================
-- Tracks all checkout events including QR code scans
CREATE TABLE IF NOT EXISTS equipment_checkout_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    equipment_id UUID REFERENCES equipment(id) ON DELETE CASCADE,
    scanned_by UUID REFERENCES auth.users(id),
    scan_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    scan_action VARCHAR(50), -- 'view_inventory', 'assign_equipment', 'return_equipment'
    location_latitude DECIMAL(10,8),
    location_longitude DECIMAL(11,8),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_equipment ON equipment_checkout_sessions(equipment_id);
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_user ON equipment_checkout_sessions(scanned_by);

-- =====================================================
-- 5. FUNCTIONS
-- =====================================================

-- Function to automatically update total linear feet on blade
CREATE OR REPLACE FUNCTION update_blade_total_usage()
RETURNS TRIGGER AS $$
BEGIN
    -- Update the total usage in equipment table
    UPDATE equipment
    SET total_usage_linear_feet = (
        SELECT COALESCE(SUM(linear_feet_cut), 0)
        FROM blade_usage_history
        WHERE equipment_id = NEW.equipment_id
    )
    WHERE id = NEW.equipment_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update blade usage automatically
DROP TRIGGER IF EXISTS trigger_update_blade_usage ON blade_usage_history;
CREATE TRIGGER trigger_update_blade_usage
    AFTER INSERT OR UPDATE ON blade_usage_history
    FOR EACH ROW
    EXECUTE FUNCTION update_blade_total_usage();

-- Function to generate unique identification code
CREATE OR REPLACE FUNCTION generate_equipment_id_code(
    p_equipment_type VARCHAR,
    p_manufacturer VARCHAR,
    p_serial_number VARCHAR
)
RETURNS VARCHAR AS $$
DECLARE
    v_prefix VARCHAR(10);
    v_timestamp VARCHAR(20);
    v_unique_code VARCHAR(100);
BEGIN
    -- Create prefix based on equipment type
    CASE p_equipment_type
        WHEN 'blade' THEN v_prefix := 'BLD';
        WHEN 'bit' THEN v_prefix := 'BIT';
        ELSE v_prefix := 'EQP';
    END CASE;

    -- Get timestamp
    v_timestamp := TO_CHAR(NOW(), 'YYYYMMDDHH24MISS');

    -- Create unique code: PREFIX-MANUFACTURER-TIMESTAMP-SERIAL
    v_unique_code := v_prefix || '-' ||
                     UPPER(LEFT(p_manufacturer, 3)) || '-' ||
                     v_timestamp || '-' ||
                     UPPER(LEFT(p_serial_number, 6));

    RETURN v_unique_code;
END;
$$ LANGUAGE plpgsql;

-- Function to check out equipment to operator
CREATE OR REPLACE FUNCTION checkout_equipment(
    p_equipment_id UUID,
    p_operator_id UUID,
    p_assigned_by UUID,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_assignment_id UUID;
    v_result JSON;
BEGIN
    -- Check if equipment is already checked out
    IF EXISTS (
        SELECT 1 FROM equipment
        WHERE id = p_equipment_id AND is_checked_out = TRUE
    ) THEN
        RETURN json_build_object(
            'success', FALSE,
            'message', 'Equipment is already checked out'
        );
    END IF;

    -- Create assignment record
    INSERT INTO blade_assignments (
        equipment_id,
        operator_id,
        assigned_by,
        checkout_notes,
        status
    ) VALUES (
        p_equipment_id,
        p_operator_id,
        p_assigned_by,
        p_notes,
        'active'
    ) RETURNING id INTO v_assignment_id;

    -- Update equipment status
    UPDATE equipment
    SET is_checked_out = TRUE
    WHERE id = p_equipment_id;

    -- Log checkout session
    INSERT INTO equipment_checkout_sessions (
        equipment_id,
        scanned_by,
        scan_action
    ) VALUES (
        p_equipment_id,
        p_assigned_by,
        'assign_equipment'
    );

    v_result := json_build_object(
        'success', TRUE,
        'message', 'Equipment checked out successfully',
        'assignment_id', v_assignment_id
    );

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 6. ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Enable RLS on new tables
ALTER TABLE blade_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE blade_usage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_checkout_sessions ENABLE ROW LEVEL SECURITY;

-- Policies for blade_assignments
CREATE POLICY "Admins can view all blade assignments"
    ON blade_assignments FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.user_type IN ('admin', 'super_admin')
        )
    );

CREATE POLICY "Operators can view their own blade assignments"
    ON blade_assignments FOR SELECT
    USING (operator_id = auth.uid());

CREATE POLICY "Admins can insert blade assignments"
    ON blade_assignments FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.user_type IN ('admin', 'super_admin')
        )
    );

CREATE POLICY "Admins can update blade assignments"
    ON blade_assignments FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.user_type IN ('admin', 'super_admin')
        )
    );

-- Policies for blade_usage_history
CREATE POLICY "Users can view blade usage history"
    ON blade_usage_history FOR SELECT
    USING (TRUE); -- All authenticated users can view

CREATE POLICY "System can insert blade usage"
    ON blade_usage_history FOR INSERT
    WITH CHECK (TRUE); -- Allow system to insert usage data

-- Policies for equipment_checkout_sessions
CREATE POLICY "Admins can view all checkout sessions"
    ON equipment_checkout_sessions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.user_type IN ('admin', 'super_admin')
        )
    );

CREATE POLICY "Users can view their own checkout sessions"
    ON equipment_checkout_sessions FOR SELECT
    USING (scanned_by = auth.uid());

CREATE POLICY "Authenticated users can insert checkout sessions"
    ON equipment_checkout_sessions FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- =====================================================
-- 7. COMMENTS
-- =====================================================

COMMENT ON TABLE blade_assignments IS 'Tracks blade/bit assignments to operators';
COMMENT ON TABLE blade_usage_history IS 'Records detailed usage metrics for blades (linear feet cut, etc.)';
COMMENT ON TABLE equipment_checkout_sessions IS 'Logs all QR code scans and checkout events';
COMMENT ON FUNCTION update_blade_total_usage() IS 'Automatically updates total linear feet on blade after usage is recorded';
COMMENT ON FUNCTION generate_equipment_id_code(VARCHAR, VARCHAR, VARCHAR) IS 'Generates unique identification codes for equipment';
COMMENT ON FUNCTION checkout_equipment(UUID, UUID, UUID, TEXT) IS 'Checks out equipment to an operator and creates assignment record';
