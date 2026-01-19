import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/equipment/maintenance-alerts
 * Get maintenance alerts for current user (operator sees theirs, admin sees all)
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
    const status = searchParams.get('status'); // 'unread', 'unresolved', 'all'
    const equipmentId = searchParams.get('equipmentId');

    let query = supabaseAdmin
      .from('equipment_maintenance_alerts')
      .select(`
        *,
        equipment:equipment_id (
          id,
          name,
          brand,
          model,
          qr_code
        ),
        schedule:schedule_id (
          id,
          maintenance_type,
          description
        )
      `)
      .order('created_at', { ascending: false });

    // Apply filters
    if (status === 'unread') {
      query = query.eq('is_read', false);
    } else if (status === 'unresolved') {
      query = query.eq('is_resolved', false);
    }

    if (equipmentId) {
      query = query.eq('equipment_id', equipmentId);
    }

    const { data: alerts, error } = await query;

    if (error) {
      console.error('Error fetching maintenance alerts:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ alerts });
  } catch (error: any) {
    console.error('Maintenance alerts API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * PATCH /api/equipment/maintenance-alerts
 * Update alert status (mark as read, acknowledge, resolve)
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

    const body = await request.json();
    const { alertId, action } = body; // action: 'mark_read', 'acknowledge', 'resolve'

    if (!alertId || !action) {
      return NextResponse.json({ error: 'Missing alertId or action' }, { status: 400 });
    }

    let updateData: any = {};

    switch (action) {
      case 'mark_read':
        updateData = { is_read: true };
        break;
      case 'acknowledge':
        updateData = { is_acknowledged: true, acknowledged_at: new Date().toISOString() };
        break;
      case 'resolve':
        updateData = { is_resolved: true, resolved_at: new Date().toISOString() };
        break;
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('equipment_maintenance_alerts')
      .update(updateData)
      .eq('id', alertId)
      .select()
      .single();

    if (error) {
      console.error('Error updating alert:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ alert: data, message: 'Alert updated successfully' });
  } catch (error: any) {
    console.error('Update alert API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
