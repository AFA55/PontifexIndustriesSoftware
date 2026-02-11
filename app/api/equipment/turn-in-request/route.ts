import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/equipment/turn-in-request
 * Get turn-in requests (operator sees theirs, admin sees all)
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
    const status = searchParams.get('status'); // 'pending', 'approved', 'in_service', 'completed', 'rejected'
    const equipmentId = searchParams.get('equipmentId');

    let query = supabaseAdmin
      .from('equipment_turn_in_requests')
      .select(`
        *,
        equipment:equipment_id (
          id,
          name,
          brand,
          model,
          serial_number,
          qr_code
        ),
        requester:requested_by (
          id,
          email
        )
      `)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    if (equipmentId) {
      query = query.eq('equipment_id', equipmentId);
    }

    const { data: requests, error } = await query;

    if (error) {
      console.error('Error fetching turn-in requests:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ requests });
  } catch (error: any) {
    console.error('Turn-in requests API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/equipment/turn-in-request
 * Create a new turn-in request
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

    // Get user profile for full name
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single();

    const body = await request.json();
    const { equipmentId, reason, description, urgency, photoUrls } = body;

    if (!equipmentId || !reason || !description) {
      return NextResponse.json(
        { error: 'Missing required fields: equipmentId, reason, description' },
        { status: 400 }
      );
    }

    const requestData = {
      equipment_id: equipmentId,
      requested_by: user.id,
      requested_by_name: profile?.full_name || user.email,
      reason,
      description,
      urgency: urgency || 'normal',
      photo_urls: photoUrls || [],
      status: 'pending'
    };

    const { data: turnInRequest, error } = await supabaseAdmin
      .from('equipment_turn_in_requests')
      .insert(requestData)
      .select()
      .single();

    if (error) {
      console.error('Error creating turn-in request:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // If equipment needs maintenance, create maintenance alert
    if (reason === 'scheduled_maintenance') {
      await supabaseAdmin.from('equipment_maintenance_alerts').insert({
        equipment_id: equipmentId,
        operator_id: user.id,
        alert_type: 'turn_in_requested',
        severity: urgency === 'critical' ? 'critical' : 'warning',
        title: 'Equipment Turn-In Requested',
        message: `Turn-in requested for maintenance: ${description}`
      });
    }

    return NextResponse.json({ request: turnInRequest, message: 'Turn-in request submitted successfully' });
  } catch (error: any) {
    console.error('Create turn-in request API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * PATCH /api/equipment/turn-in-request
 * Update turn-in request (admin approval/rejection, service tracking)
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
      .select('role, full_name')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const {
      requestId,
      status,
      adminNotes,
      serviceStartedAt,
      serviceCompletedAt,
      servicePerformedBy,
      serviceCost
    } = body;

    if (!requestId) {
      return NextResponse.json({ error: 'Missing requestId' }, { status: 400 });
    }

    const updateData: any = {
      reviewed_by: user.id,
      reviewed_by_name: profile?.full_name || user.email,
      reviewed_at: new Date().toISOString()
    };

    if (status) updateData.status = status;
    if (adminNotes) updateData.admin_notes = adminNotes;
    if (serviceStartedAt) updateData.service_started_at = serviceStartedAt;
    if (serviceCompletedAt) updateData.service_completed_at = serviceCompletedAt;
    if (servicePerformedBy) updateData.service_performed_by = servicePerformedBy;
    if (serviceCost !== undefined) updateData.service_cost = serviceCost;

    const { data: turnInRequest, error } = await supabaseAdmin
      .from('equipment_turn_in_requests')
      .update(updateData)
      .eq('id', requestId)
      .select()
      .single();

    if (error) {
      console.error('Error updating turn-in request:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // If approved, update equipment status to maintenance
    if (status === 'approved') {
      const { data: requestData } = await supabaseAdmin
        .from('equipment_turn_in_requests')
        .select('equipment_id')
        .eq('id', requestId)
        .single();

      if (requestData) {
        await supabaseAdmin
          .from('equipment')
          .update({ status: 'maintenance' })
          .eq('id', requestData.equipment_id);
      }
    }

    // If completed, update equipment status back to available
    if (status === 'completed') {
      const { data: requestData } = await supabaseAdmin
        .from('equipment_turn_in_requests')
        .select('equipment_id')
        .eq('id', requestId)
        .single();

      if (requestData) {
        await supabaseAdmin
          .from('equipment')
          .update({ status: 'available' })
          .eq('id', requestData.equipment_id);
      }
    }

    return NextResponse.json({ request: turnInRequest, message: 'Turn-in request updated successfully' });
  } catch (error: any) {
    console.error('Update turn-in request API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
