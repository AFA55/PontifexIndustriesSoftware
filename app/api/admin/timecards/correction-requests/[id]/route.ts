export const dynamic = 'force-dynamic';

/**
 * PATCH /api/admin/timecards/correction-requests/[id]
 * Admin approves or rejects a timecard correction request.
 *
 * Body: { action: 'approve' | 'reject', reviewer_notes?: string }
 *
 * On approve:
 *   1. Updates correction request status to 'approved'
 *   2. Updates the actual timecard clock_in_time and/or clock_out_time
 *   3. Recalculates total_hours
 *   4. Notifies the worker
 *
 * On reject:
 *   1. Updates correction request status to 'rejected'
 *   2. Notifies the worker
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const tenantId = auth.tenantId;
    if (!tenantId) {
      return NextResponse.json(
        { error: 'Tenant scope required' },
        { status: 400 }
      );
    }

    const { id: correctionId } = await params;
    const body = await request.json();
    const { action, reviewer_notes } = body;

    if (!action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: 'action must be "approve" or "reject"' },
        { status: 400 }
      );
    }

    // Fetch the correction request (scoped to tenant)
    const { data: correction, error: fetchError } = await supabaseAdmin
      .from('timecard_correction_requests')
      .select(`
        id,
        timecard_id,
        requested_by,
        requested_clock_in,
        requested_clock_out,
        status,
        timecards!timecard_id (
          id,
          date,
          clock_in_time,
          clock_out_time,
          lunch_minutes,
          lunch_deducted
        ),
        profiles!requested_by (
          id,
          full_name
        )
      `)
      .eq('id', correctionId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (fetchError || !correction) {
      return NextResponse.json({ error: 'Correction request not found' }, { status: 404 });
    }

    if (correction.status !== 'pending') {
      return NextResponse.json(
        { error: `This request has already been ${correction.status}` },
        { status: 409 }
      );
    }

    // Self-approval block
    if (correction.requested_by === auth.userId) {
      return NextResponse.json(
        { error: 'You cannot approve or reject your own correction request' },
        { status: 403 }
      );
    }

    const now = new Date().toISOString();
    const timecard = (correction as any).timecards;
    const workerProfile = (correction as any).profiles;
    const workerName = workerProfile?.full_name || 'Team member';
    const dateFormatted = timecard?.date
      ? new Date(timecard.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      : 'unknown date';

    // Update the correction request
    const { error: updateCorrectionError } = await supabaseAdmin
      .from('timecard_correction_requests')
      .update({
        status: action === 'approve' ? 'approved' : 'rejected',
        reviewed_by: auth.userId,
        reviewed_at: now,
        reviewer_notes: reviewer_notes || null,
        updated_at: now,
      })
      .eq('id', correctionId);

    if (updateCorrectionError) {
      console.error('Error updating correction request:', updateCorrectionError);
      return NextResponse.json({ error: 'Failed to update correction request' }, { status: 500 });
    }

    if (action === 'approve' && timecard) {
      // Calculate new times (use requested values where provided, fall back to current)
      const newClockIn = correction.requested_clock_in || timecard.clock_in_time;
      const newClockOut = correction.requested_clock_out !== undefined
        ? correction.requested_clock_out
        : timecard.clock_out_time;

      // Recalculate total_hours from updated times minus lunch deduction
      let newTotalHours: number | null = null;
      if (newClockIn && newClockOut) {
        const inMs = new Date(newClockIn).getTime();
        const outMs = new Date(newClockOut).getTime();
        if (outMs > inMs) {
          const rawHours = (outMs - inMs) / 3600000;
          const lunchMinutes = timecard.lunch_deducted ? (timecard.lunch_minutes || 0) : 0;
          newTotalHours = Math.max(0, rawHours - lunchMinutes / 60);
          // Round to 2 decimal places
          newTotalHours = Math.round(newTotalHours * 100) / 100;
        }
      }

      const timecardUpdate: Record<string, unknown> = {};
      if (correction.requested_clock_in) timecardUpdate.clock_in_time = correction.requested_clock_in;
      if (correction.requested_clock_out !== undefined && correction.requested_clock_out !== null) {
        timecardUpdate.clock_out_time = correction.requested_clock_out;
      }
      if (newTotalHours !== null) timecardUpdate.total_hours = newTotalHours;

      if (Object.keys(timecardUpdate).length > 0) {
        const { error: timecardUpdateError } = await supabaseAdmin
          .from('timecards')
          .update(timecardUpdate)
          .eq('id', timecard.id);

        if (timecardUpdateError) {
          console.error('Error updating timecard after approval:', timecardUpdateError);
          // Don't fail the whole request — correction is already marked approved
        }
      }

      // Fire-and-forget: notify the worker
      Promise.resolve(
        supabaseAdmin.from('schedule_notifications').insert({
          recipient_id: correction.requested_by,
          type: 'correction_approved',
          title: 'Time Correction Approved',
          message: `Your time correction for ${dateFormatted} was approved.`,
          tenant_id: tenantId,
          read: false,
          metadata: {
            correction_request_id: correctionId,
            timecard_id: correction.timecard_id,
          },
        })
      ).catch(() => {});
    } else if (action === 'reject') {
      // Fire-and-forget: notify the worker
      const reasonText = reviewer_notes
        ? ` Reason: ${reviewer_notes}.`
        : '';
      Promise.resolve(
        supabaseAdmin.from('schedule_notifications').insert({
          recipient_id: correction.requested_by,
          type: 'correction_rejected',
          title: 'Time Correction Not Approved',
          message: `Your time correction for ${dateFormatted} was not approved.${reasonText}`,
          tenant_id: tenantId,
          read: false,
          metadata: {
            correction_request_id: correctionId,
            timecard_id: correction.timecard_id,
          },
        })
      ).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      data: {
        id: correctionId,
        status: action === 'approve' ? 'approved' : 'rejected',
        reviewed_at: now,
      },
    });
  } catch (error) {
    console.error('Unexpected error in correction-requests PATCH:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
