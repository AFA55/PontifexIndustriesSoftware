export const dynamic = 'force-dynamic';

/**
 * PATCH /api/admin/timecards/correction-requests/[id]
 * Admin approves or rejects a timecard correction request.
 *
 * Body: {
 *   action: 'approve' | 'reject',
 *   reviewer_notes?: string,
 *   override_clock_in?: string | null,   // ISO — admin-adjusted time (Modify & Approve)
 *   override_clock_out?: string | null,  // ISO — admin-adjusted time (Modify & Approve)
 * }
 *
 * On approve:
 *   1. Updates correction request status to 'approved'
 *   2. Updates the actual timecard clock_in_time and/or clock_out_time
 *      — using admin overrides when supplied, else the operator's requested values
 *   3. Recalculates total_hours (lunch deduction preserved)
 *   4. Notifies the worker
 *   5. Appends "[admin adjusted times]" to reviewer_notes when an override
 *      differs from what the operator requested (audit trail)
 *
 * On reject:
 *   1. Updates correction request status to 'rejected'
 *   2. Notifies the worker
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';
import { parseYMDLocal } from '@/lib/dates';
import { recomputeLateForEdit } from '@/lib/timecard-start';

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
    const { action, reviewer_notes, override_clock_in, override_clock_out } = body;

    if (!action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: 'action must be "approve" or "reject"' },
        { status: 400 }
      );
    }

    // Validate admin override timestamps (Modify & Approve). Only meaningful on approve.
    const hasOverrideIn = override_clock_in !== undefined && override_clock_in !== null && override_clock_in !== '';
    const hasOverrideOut = override_clock_out !== undefined && override_clock_out !== null && override_clock_out !== '';

    if (hasOverrideIn && isNaN(Date.parse(override_clock_in))) {
      return NextResponse.json({ error: 'override_clock_in must be a valid timestamp' }, { status: 400 });
    }
    if (hasOverrideOut && isNaN(Date.parse(override_clock_out))) {
      return NextResponse.json({ error: 'override_clock_out must be a valid timestamp' }, { status: 400 });
    }
    if (hasOverrideIn && hasOverrideOut && Date.parse(override_clock_out) <= Date.parse(override_clock_in)) {
      return NextResponse.json({ error: 'override_clock_out must be after override_clock_in' }, { status: 400 });
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
        metadata,
        timecards!timecard_id (
          id,
          user_id,
          date,
          is_shop_hours,
          clock_in_time,
          clock_out_time,
          lunch_duration_minutes
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

    // Auto-flagged out-of-geofence clock-outs are NOT worker-submitted edit
    // requests — the worker didn't ask for anything, they just clocked out beyond
    // the shop radius. "Acknowledge" (approve with no admin override) is therefore
    // a pure status flip: the recorded clock-out stands, we don't rewrite the
    // timecard, and we don't tell the worker their "correction was approved".
    // If the admin DID adjust the time (Modify), it's a real edit → behave normally.
    const isAuto = (correction as any).metadata?.source === 'auto_out_of_radius';
    const isAckOnly = isAuto && action === 'approve' && !hasOverrideIn && !hasOverrideOut;
    const workerName = workerProfile?.full_name || 'Team member';
    const dateFormatted = timecard?.date
      ? parseYMDLocal(timecard.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      : 'unknown date';

    // Determine whether the admin adjusted the proposed times (audit marker).
    // An override "differs" when it is supplied AND not equal to the operator's request.
    const inDiffers = action === 'approve' && hasOverrideIn &&
      (!correction.requested_clock_in ||
        Date.parse(override_clock_in) !== Date.parse(correction.requested_clock_in));
    const outDiffers = action === 'approve' && hasOverrideOut &&
      (!correction.requested_clock_out ||
        Date.parse(override_clock_out) !== Date.parse(correction.requested_clock_out));
    const adminAdjusted = inDiffers || outDiffers;

    const baseNotes = (reviewer_notes && String(reviewer_notes).trim()) || '';
    const finalNotes = adminAdjusted
      ? `${baseNotes} [admin adjusted times]`.trim()
      : (baseNotes || null);

    // Update the correction request
    const { error: updateCorrectionError } = await supabaseAdmin
      .from('timecard_correction_requests')
      .update({
        status: action === 'approve' ? 'approved' : 'rejected',
        reviewed_by: auth.userId,
        reviewed_at: now,
        reviewer_notes: finalNotes,
        updated_at: now,
      })
      .eq('id', correctionId);

    if (updateCorrectionError) {
      console.error('Error updating correction request:', updateCorrectionError);
      return NextResponse.json({ error: 'Failed to update correction request' }, { status: 500 });
    }

    if (action === 'approve' && timecard && !isAckOnly) {
      // Effective times: admin override wins, then operator request, then current value.
      const effClockIn = hasOverrideIn
        ? override_clock_in
        : (correction.requested_clock_in || timecard.clock_in_time);
      const effClockOut = hasOverrideOut
        ? override_clock_out
        : (correction.requested_clock_out !== undefined && correction.requested_clock_out !== null
            ? correction.requested_clock_out
            : timecard.clock_out_time);

      // Recalculate total_hours from effective times minus lunch deduction
      let newTotalHours: number | null = null;
      if (effClockIn && effClockOut) {
        const inMs = new Date(effClockIn).getTime();
        const outMs = new Date(effClockOut).getTime();
        if (outMs > inMs) {
          const rawHours = (outMs - inMs) / 3600000;
          const lunchMinutes = Number(timecard.lunch_duration_minutes) || 0;
          newTotalHours = Math.max(0, rawHours - lunchMinutes / 60);
          // Round to 2 decimal places
          newTotalHours = Math.round(newTotalHours * 100) / 100;
        }
      }

      // Persist clock_in if the admin overrode it or the operator requested it.
      // Persist clock_out if the admin overrode it or the operator requested it.
      const timecardUpdate: Record<string, unknown> = {};
      if (hasOverrideIn) {
        timecardUpdate.clock_in_time = override_clock_in;
      } else if (correction.requested_clock_in) {
        timecardUpdate.clock_in_time = correction.requested_clock_in;
      }
      if (hasOverrideOut) {
        timecardUpdate.clock_out_time = override_clock_out;
      } else if (correction.requested_clock_out !== undefined && correction.requested_clock_out !== null) {
        timecardUpdate.clock_out_time = correction.requested_clock_out;
      }
      if (newTotalHours !== null) timecardUpdate.total_hours = newTotalHours;

      // Recompute the late flag whenever the clock-in time is being changed (works
      // the same regardless of correction source — auto out-of-radius or manual).
      // Tenant-tz aware, strict `>` grace, the timecard's OWN date. Notification-free.
      if (timecardUpdate.clock_in_time !== undefined && timecardUpdate.clock_in_time) {
        try {
          const { data: operator } = await supabaseAdmin
            .from('profiles')
            .select('role')
            .eq('id', timecard.user_id)
            .maybeSingle();
          const late = await recomputeLateForEdit({
            supabaseAdmin,
            tenantId,
            operatorId: timecard.user_id,
            role: operator?.role ?? null,
            clockInIso: new Date(timecardUpdate.clock_in_time as string).toISOString(),
            localDate: timecard.date,
            isShopHours: timecard.is_shop_hours === true,
          });
          timecardUpdate.is_late = late.is_late;
          timecardUpdate.late_minutes = late.late_minutes;
          timecardUpdate.scheduled_start_time = late.scheduled_start_time;
          timecardUpdate.late_source = late.late_source;
        } catch {
          // Late recompute is non-critical; never block the approval.
        }
      }

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

      // Fire-and-forget: notify the worker (in the `notifications` table the bell
      // reads, with a deep-link to their timecard).
      Promise.resolve(
        supabaseAdmin.from('notifications').insert({
          user_id: correction.requested_by,
          type: 'correction_approved',
          // notification_type has a CHECK constraint (only ~12 values); anything
          // else is silently dropped by the fire-and-forget insert. Use the
          // allowed 'general' value and keep the specific event key in `type`.
          notification_type: 'general',
          title: 'Time Correction Approved',
          message: `Your time correction for ${dateFormatted} was approved.`,
          tenant_id: tenantId,
          read: false,
          is_read: false,
          action_url: '/dashboard/timecard',
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
        supabaseAdmin.from('notifications').insert({
          user_id: correction.requested_by,
          type: 'correction_rejected',
          notification_type: 'general', // allowed CHECK value (see approve branch)
          title: 'Time Correction Not Approved',
          message: `Your time correction for ${dateFormatted} was not approved.${reasonText}`,
          tenant_id: tenantId,
          read: false,
          is_read: false,
          action_url: '/dashboard/timecard',
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
