/**
 * GET /api/admin/timecards/[id]
 * Get a specific timecard entry with all details including segments and GPS data.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin, isTableNotFoundError } from '@/lib/api-auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id: timecardId } = await params;
    const tenantId = auth.tenantId;

    // Fetch the timecard
    let query = supabaseAdmin
      .from('timecards')
      .select('*')
      .eq('id', timecardId);
    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    }

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
