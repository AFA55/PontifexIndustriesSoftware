export const dynamic = 'force-dynamic';

/**
 * GET  /api/admin/timecards/[id] — fetch a specific timecard with full detail
 * PATCH /api/admin/timecards/[id] — admin-correct clock-in/out times or add notes
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin, isTableNotFoundError } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id: timecardId } = await params;
    const tenantId = auth.tenantId;
    if (!tenantId) return NextResponse.json({ error: 'Tenant scope required. super_admin must pass ?tenantId=' }, { status: 400 });
    // Fetch the timecard
    let query = supabaseAdmin
      .from('timecards')
      .select('*')
      .eq('id', timecardId);
    query = query.eq('tenant_id', tenantId);

    const { data: timecard, error: fetchError } = await query.single();

    if (fetchError) {
      if (isTableNotFoundError(fetchError)) {
        return NextResponse.json({ error: 'Timecard system not available' }, { status: 503 });
      }
      if (fetchError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Timecard not found' }, { status: 404 });
      }
      console.error('Error fetching timecard:', fetchError);
      return NextResponse.json({ error: 'Failed to fetch timecard' }, { status: 500 });
    }

    // Get user profile
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('full_name, email, role, phone')
      .eq('id', timecard.user_id)
      .single();

    // Get GPS logs for this timecard (fire separate query, may not exist)
    let gpsLogs: any[] = [];
    try {
      const { data: logs } = await supabaseAdmin
        .from('timecard_gps_logs')
        .select('*')
        .eq('timecard_id', timecardId)
        .order('recorded_at', { ascending: true });
      gpsLogs = logs || [];
    } catch {
      // Table may not exist
    }

    // Get approver name if approved
    let approverName: string | null = null;
    if (timecard.approved_by) {
      const { data: approver } = await supabaseAdmin
        .from('profiles')
        .select('full_name')
        .eq('id', timecard.approved_by)
        .single();
      approverName = approver?.full_name || null;
    }

    // Get editor name if edited
    let editorName: string | null = null;
    if (timecard.edited_by) {
      const { data: editor } = await supabaseAdmin
        .from('profiles')
        .select('full_name')
        .eq('id', timecard.edited_by)
        .single();
      editorName = editor?.full_name || null;
    }

    return NextResponse.json({
      success: true,
      data: {
        ...timecard,
        operator: {
          fullName: profile?.full_name || null,
          email: profile?.email || null,
          role: profile?.role || null,
          phone: profile?.phone || null,
        },
        approverName,
        editorName,
        gpsLogs,
        segments: timecard.segments || [],
      },
    });
  } catch (error: unknown) {
    console.error('Unexpected error in GET /api/admin/timecards/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/timecards/[id]
 * Admin-correct clock-in/out times, add notes, and recalculate total_hours.
 * Clearing late flags when clock-in is corrected backward.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id: timecardId } = await params;
    const tenantId = await getTenantId(auth.userId);

    const body = await request.json();
    const { clock_in_time, clock_out_time, admin_notes } = body;

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (admin_notes !== undefined) updates.admin_notes = admin_notes;
    if (clock_in_time) updates.clock_in_time = clock_in_time;
    if (clock_out_time) updates.clock_out_time = clock_out_time;

    // Fetch existing record so we can recalculate hours and check late status
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('timecards')
      .select('clock_in_time, clock_out_time, break_minutes, is_late, scheduled_start_time')
      .eq('id', timecardId)
      .eq('tenant_id', tenantId)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Timecard not found' }, { status: 404 });
      }
      return NextResponse.json({ error: 'Failed to fetch timecard' }, { status: 500 });
    }

    // Recalculate total_hours when either time changes
    const inTime = clock_in_time
      ? new Date(clock_in_time)
      : new Date(existing.clock_in_time);
    const outTimeRaw = clock_out_time
      ? new Date(clock_out_time)
      : existing.clock_out_time
        ? new Date(existing.clock_out_time)
        : null;

    if (outTimeRaw) {
      const rawHours = (outTimeRaw.getTime() - inTime.getTime()) / 3600000;
      const breakHours = (existing.break_minutes || 0) / 60;
      updates.total_hours = Math.max(0, rawHours - breakHours);
    }

    // Clear late flags if admin corrects clock-in time (assume the correction makes it on-time)
    if (clock_in_time && existing.is_late) {
      updates.is_late = false;
      updates.late_minutes = 0;
    }

    const { data, error: updateError } = await supabaseAdmin
      .from('timecards')
      .update(updates)
      .eq('id', timecardId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating timecard:', updateError);
      return NextResponse.json({ error: 'Failed to update timecard' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    console.error('Unexpected error in PATCH /api/admin/timecards/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
