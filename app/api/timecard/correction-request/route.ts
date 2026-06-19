export const dynamic = 'force-dynamic';

/**
 * POST /api/timecard/correction-request
 * Worker submits a correction to their own timecard (wrong clock-in/out, forgot to clock out, etc.)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';
import { parseYMDLocal } from '@/lib/dates';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const { timecard_id, requested_clock_in, requested_clock_out, reason } = body;

    // Validate required fields
    if (!timecard_id) {
      return NextResponse.json({ error: 'timecard_id is required' }, { status: 400 });
    }
    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return NextResponse.json({ error: 'reason is required' }, { status: 400 });
    }
    if (!requested_clock_in && !requested_clock_out) {
      return NextResponse.json(
        { error: 'At least one of requested_clock_in or requested_clock_out must be provided' },
        { status: 400 }
      );
    }

    // Validate timestamps if provided
    if (requested_clock_in && isNaN(Date.parse(requested_clock_in))) {
      return NextResponse.json({ error: 'requested_clock_in must be a valid timestamp' }, { status: 400 });
    }
    if (requested_clock_out && isNaN(Date.parse(requested_clock_out))) {
      return NextResponse.json({ error: 'requested_clock_out must be a valid timestamp' }, { status: 400 });
    }

    // Verify the timecard belongs to this user and exists in their tenant
    const { data: timecard, error: tcError } = await supabaseAdmin
      .from('timecards')
      .select('id, user_id, tenant_id, date, clock_in_time, clock_out_time')
      .eq('id', timecard_id)
      .maybeSingle();

    if (tcError || !timecard) {
      return NextResponse.json({ error: 'Timecard not found' }, { status: 404 });
    }

    if (timecard.user_id !== auth.userId) {
      return NextResponse.json({ error: 'You can only request corrections for your own timecards' }, { status: 403 });
    }

    if (auth.tenantId && timecard.tenant_id !== auth.tenantId) {
      return NextResponse.json({ error: 'Timecard not found' }, { status: 404 });
    }

    // Get requester profile for notification message
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('full_name')
      .eq('id', auth.userId)
      .maybeSingle();

    const requesterName = profile?.full_name || auth.userEmail;
    const tenantId = timecard.tenant_id;

    // Insert the correction request
    const { data: correctionReq, error: insertError } = await supabaseAdmin
      .from('timecard_correction_requests')
      .insert({
        tenant_id: tenantId,
        timecard_id,
        requested_by: auth.userId,
        requested_clock_in: requested_clock_in || null,
        requested_clock_out: requested_clock_out || null,
        reason: reason.trim(),
        status: 'pending',
      })
      .select('id, status')
      .single();

    if (insertError) {
      console.error('Error inserting correction request:', insertError);
      return NextResponse.json({ error: 'Failed to submit correction request' }, { status: 500 });
    }

    // Fire-and-forget: notify all admins/ops_managers/super_admins in the tenant.
    // IMPORTANT: write to `notifications` (the table the in-app bell reads via
    // /api/notifications) — NOT `schedule_notifications` (which the bell never
    // reads and has no action_url column). Including action_url makes the bell's
    // "View" deep-link to the corrections approval page.
    const dateFormatted = parseYMDLocal(timecard.date).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric'
    });

    Promise.resolve(
      supabaseAdmin
        .from('profiles')
        .select('id')
        .in('role', ['admin', 'super_admin', 'operations_manager'])
        .eq('tenant_id', tenantId)
    ).then(({ data: adminProfiles }) => {
      if (!adminProfiles || adminProfiles.length === 0) return;
      const notifications = adminProfiles.map((p: { id: string }) => ({
        user_id: p.id,
        type: 'correction_request',
        notification_type: 'correction_request',
        title: 'Time Correction Request',
        message: `${requesterName} submitted a time correction for ${dateFormatted}.`,
        tenant_id: tenantId,
        read: false,
        is_read: false,
        action_url: '/dashboard/admin/timecards/corrections',
        metadata: {
          correction_request_id: correctionReq.id,
          timecard_id,
          operator_id: auth.userId,
          operator_name: requesterName,
          timecard_date: timecard.date,
        },
      }));
      return supabaseAdmin.from('notifications').insert(notifications);
    }).catch(() => {});

    return NextResponse.json(
      { success: true, data: { id: correctionReq.id, status: 'pending' } },
      { status: 201 }
    );
  } catch (error) {
    console.error('Unexpected error in correction-request route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
