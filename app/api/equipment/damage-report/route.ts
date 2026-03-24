import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, requireAdmin } from '@/lib/api-auth';

/**
 * GET /api/equipment/damage-report
 * Get damage reports (operator sees theirs, admin sees all)
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const equipmentId = searchParams.get('equipmentId');
    const status = searchParams.get('status'); // 'reported', 'under_review', 'approved_for_repair', etc.

    let query = supabaseAdmin
      .from('equipment_damage_reports')
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
        reporter:reported_by (
          id,
          email
        ),
        job:job_order_id (
          id,
          job_title,
          customer_name
        )
      `)
      .order('created_at', { ascending: false });

    if (equipmentId) {
      query = query.eq('equipment_id', equipmentId);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data: reports, error } = await query;

    if (error) {
      console.error('Error fetching damage reports:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ reports });
  } catch (error: any) {
    console.error('Damage reports API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/equipment/damage-report
 * Create a new damage report
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;

  try {
    // Get user profile for full name
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('full_name')
      .eq('id', auth.userId)
      .single();

    const body = await request.json();
    const {
      equipmentId,
      damageTitle,
      damageDescription,
      severity,
      incidentType,
      incidentDescription,
      jobOrderId,
      locationOfIncident,
      dateOfIncident,
      photoUrls,
      videoUrls,
      equipmentOperable,
      safetyConcern
    } = body;

    if (!equipmentId || !damageTitle || !damageDescription) {
      return NextResponse.json(
        { error: 'Missing required fields: equipmentId, damageTitle, damageDescription' },
        { status: 400 }
      );
    }

    // Get who last used the equipment
    const { data: lastUser } = await supabaseAdmin.rpc('get_last_equipment_user', {
      p_equipment_id: equipmentId
    });

    const reportData = {
      equipment_id: equipmentId,
      reported_by: auth.userId,
      reported_by_name: profile?.full_name || auth.userEmail,
      damage_title: damageTitle,
      damage_description: damageDescription,
      severity: severity || 'moderate',
      incident_type: incidentType,
      incident_description: incidentDescription,
      job_order_id: jobOrderId,
      location_of_incident: locationOfIncident,
      date_of_incident: dateOfIncident,
      photo_urls: photoUrls || [],
      video_urls: videoUrls || [],
      equipment_operable: equipmentOperable !== undefined ? equipmentOperable : false,
      safety_concern: safetyConcern !== undefined ? safetyConcern : false,
      last_used_by: lastUser?.[0]?.user_id || null,
      last_used_by_name: lastUser?.[0]?.user_name || null,
      last_job_id: lastUser?.[0]?.job_title || null,
      status: 'reported'
    };

    const { data: report, error } = await supabaseAdmin
      .from('equipment_damage_reports')
      .insert(reportData)
      .select()
      .single();

    if (error) {
      console.error('Error creating damage report:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ report, message: 'Damage report submitted successfully' });
  } catch (error: any) {
    console.error('Create damage report API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * PATCH /api/equipment/damage-report
 * Update damage report (admin review, assessment, resolution)
 */
export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;

  try {
    // Get admin profile for full name
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('full_name')
      .eq('id', auth.userId)
      .single();

    const body = await request.json();
    const {
      reportId,
      status,
      assessmentNotes,
      estimatedRepairCost,
      estimatedDowntimeDays,
      partsNeeded,
      adminNotes,
      resolutionNotes
    } = body;

    if (!reportId) {
      return NextResponse.json({ error: 'Missing reportId' }, { status: 400 });
    }

    const updateData: any = {
      reviewed_by: auth.userId,
      reviewed_by_name: profile?.full_name || auth.userEmail,
      reviewed_at: new Date().toISOString()
    };

    if (status) updateData.status = status;
    if (assessmentNotes) updateData.assessment_notes = assessmentNotes;
    if (estimatedRepairCost !== undefined) updateData.estimated_repair_cost = estimatedRepairCost;
    if (estimatedDowntimeDays !== undefined) updateData.estimated_downtime_days = estimatedDowntimeDays;
    if (partsNeeded) updateData.parts_needed = partsNeeded;
    if (adminNotes) updateData.admin_notes = adminNotes;
    if (resolutionNotes) updateData.resolution_notes = resolutionNotes;

    if (status && ['repair_completed', 'equipment_retired', 'no_action_needed'].includes(status)) {
      updateData.resolved_at = new Date().toISOString();
    }

    const { data: report, error } = await supabaseAdmin
      .from('equipment_damage_reports')
      .update(updateData)
      .eq('id', reportId)
      .select()
      .single();

    if (error) {
      console.error('Error updating damage report:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ report, message: 'Damage report updated successfully' });
  } catch (error: any) {
    console.error('Update damage report API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
