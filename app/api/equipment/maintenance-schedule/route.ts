import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/equipment/maintenance-schedule
 * Get maintenance schedules (admin sees all, operators see for their equipment)
 */
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const equipmentId = searchParams.get('equipmentId');
    const activeOnly = searchParams.get('activeOnly') === 'true';

    let query = supabaseAdmin
      .from('equipment_maintenance_schedules')
      .select(`
        *,
        equipment:equipment_id (
          id,
          name,
          brand,
          model,
          serial_number,
          assigned_to
        )
      `)
      .order('created_at', { ascending: false });

    if (equipmentId) {
      query = query.eq('equipment_id', equipmentId);
    }

    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    const { data: schedules, error } = await query;

    if (error) {
      console.error('Error fetching maintenance schedules:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ schedules });
  } catch (error: any) {
    console.error('Maintenance schedules API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/equipment/maintenance-schedule
 * Create a new maintenance schedule (admin only)
 */
export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const {
      equipmentId,
      maintenanceType,
      description,
      intervalHours,
      intervalDays,
      intervalLinearFeet,
      alertHoursBefore,
      alertDaysBefore,
      alertFeetBefore,
      lastMaintenanceDate,
      lastMaintenanceHours,
      lastMaintenanceFeet
    } = body;

    if (!equipmentId || !maintenanceType) {
      return NextResponse.json(
        { error: 'Missing required fields: equipmentId, maintenanceType' },
        { status: 400 }
      );
    }

    const scheduleData = {
      equipment_id: equipmentId,
      maintenance_type: maintenanceType,
      description,
      interval_hours: intervalHours,
      interval_days: intervalDays,
      interval_linear_feet: intervalLinearFeet,
      alert_hours_before: alertHoursBefore || 5,
      alert_days_before: alertDaysBefore || 7,
      alert_feet_before: alertFeetBefore || 500,
      last_maintenance_date: lastMaintenanceDate || new Date().toISOString(),
      last_maintenance_hours: lastMaintenanceHours || 0,
      last_maintenance_feet: lastMaintenanceFeet || 0,
      created_by: user.id,
      is_active: true
    };

    const { data: schedule, error } = await supabaseAdmin
      .from('equipment_maintenance_schedules')
      .insert(scheduleData)
      .select()
      .single();

    if (error) {
      console.error('Error creating maintenance schedule:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ schedule, message: 'Maintenance schedule created successfully' });
  } catch (error: any) {
    console.error('Create maintenance schedule API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * PATCH /api/equipment/maintenance-schedule
 * Update maintenance schedule (admin only)
 */
export async function PATCH(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const {
      scheduleId,
      maintenanceType,
      description,
      intervalHours,
      intervalDays,
      intervalLinearFeet,
      alertHoursBefore,
      alertDaysBefore,
      alertFeetBefore,
      lastMaintenanceDate,
      lastMaintenanceHours,
      lastMaintenanceFeet,
      isActive
    } = body;

    if (!scheduleId) {
      return NextResponse.json({ error: 'Missing scheduleId' }, { status: 400 });
    }

    const updateData: any = {};

    if (maintenanceType) updateData.maintenance_type = maintenanceType;
    if (description !== undefined) updateData.description = description;
    if (intervalHours !== undefined) updateData.interval_hours = intervalHours;
    if (intervalDays !== undefined) updateData.interval_days = intervalDays;
    if (intervalLinearFeet !== undefined) updateData.interval_linear_feet = intervalLinearFeet;
    if (alertHoursBefore !== undefined) updateData.alert_hours_before = alertHoursBefore;
    if (alertDaysBefore !== undefined) updateData.alert_days_before = alertDaysBefore;
    if (alertFeetBefore !== undefined) updateData.alert_feet_before = alertFeetBefore;
    if (lastMaintenanceDate) updateData.last_maintenance_date = lastMaintenanceDate;
    if (lastMaintenanceHours !== undefined) updateData.last_maintenance_hours = lastMaintenanceHours;
    if (lastMaintenanceFeet !== undefined) updateData.last_maintenance_feet = lastMaintenanceFeet;
    if (isActive !== undefined) updateData.is_active = isActive;

    const { data: schedule, error } = await supabaseAdmin
      .from('equipment_maintenance_schedules')
      .update(updateData)
      .eq('id', scheduleId)
      .select()
      .single();

    if (error) {
      console.error('Error updating maintenance schedule:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ schedule, message: 'Maintenance schedule updated successfully' });
  } catch (error: any) {
    console.error('Update maintenance schedule API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * DELETE /api/equipment/maintenance-schedule
 * Delete maintenance schedule (admin only)
 */
export async function DELETE(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const scheduleId = searchParams.get('scheduleId');

    if (!scheduleId) {
      return NextResponse.json({ error: 'Missing scheduleId' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('equipment_maintenance_schedules')
      .delete()
      .eq('id', scheduleId);

    if (error) {
      console.error('Error deleting maintenance schedule:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: 'Maintenance schedule deleted successfully' });
  } catch (error: any) {
    console.error('Delete maintenance schedule API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
