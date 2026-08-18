export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/schedule-board/assign
 * THE write path for assigning/reassigning an operator and/or helper.
 *
 * Body: {
 *   jobOrderId: string,
 *   operatorId?: string | null,   // OMIT to leave the operator unchanged;
 *                                 // null to deliberately take them off
 *   helperId?: string | null,     // OMIT to leave the helper unchanged;
 *                                 // null to deliberately take them off
 *   assignment_date?: 'YYYY-MM-DD',    // the board date the change anchors on
 *   scope?: 'day' | 'remaining',       // DEFAULT 'day' — see below
 *   position?: 'first' | 'last',       // default 'last' — where in the
 *                                      // operator's day this job lands when
 *                                      // they already have a job that date
 * }
 *
 * All semantics (per-day ledger, sequencing, status guard, notifications,
 * outgoing-operator preservation) live in lib/reassign.ts — shared with the
 * reorder route so they cannot drift.
 *
 * Access: schedule-board editors (requireScheduleBoardAccess)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireScheduleBoardAccess } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';
import { logAuditEvent } from '@/lib/audit';
import { logApiError } from '@/lib/error-logger';
import { applyReassignment, shouldPromoteToAssigned, shouldDowngradeToScheduled, ordinal } from '@/lib/reassign';
import { crewClearNeedsConfirmation, crewClearBlockedMessage } from '@/lib/crew-assignment';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireScheduleBoardAccess(request);
    if (!auth.authorized) return auth.response;

    const tenantId = await getTenantId(auth.userId);

    if (!tenantId) return NextResponse.json({ error: 'Tenant scope required. super_admin must pass ?tenantId=' }, { status: 400 });
    const body = await request.json();
    const { jobOrderId, assignment_date, scope, position } = body;

    // OMITTING `operatorId` MEANS "LEAVE THE OPERATOR ALONE" — it is not the
    // same as sending null. On Aug 18 the board's row-helper handler sent
    // `operatorId: <name lookup> || null` and its lookup missed a nicknamed
    // operator, so a helper change stripped the lead off three jobs, two of
    // them `in_route`. `'operatorId' in body` is the distinction that was
    // missing; `??` alone would have collapsed the two states again.
    const operatorId: string | null | undefined =
      'operatorId' in body ? (body.operatorId ?? null) : undefined;

    // THE HELPER SEAT HAS THE SAME THREE STATES, and it has to be read the same
    // way. `helperId ?? null` collapsed them: an omitted key — which three
    // callers on the board now send precisely to mean "I am not touching the
    // helper" — arrived as an explicit `null`, i.e. "take the helper off". The
    // edit panel changing ONLY the operator would have wiped the helper, and
    // with scope 'remaining' it would have done it on every remaining day of a
    // multi-day job. /reorder already reads it this way; /assign did not.
    const helperId: string | null | undefined =
      'helperId' in body ? (body.helperId ?? null) : undefined;
    const force = body.force === true;

    if (!jobOrderId) {
      return NextResponse.json(
        { error: 'Missing required field: jobOrderId' },
        { status: 400 }
      );
    }

    if (assignment_date) {
      // ── Per-day path: the shared reassignment write path ────────────────
      const result = await applyReassignment({
        jobOrderId,
        operatorId,
        // undefined = keep whoever is on it (applyReassignment honours it).
        helperId,
        assignmentDate: assignment_date,
        // DEFAULT 'day', not 'remaining' (founder, Aug 11: "I have someone on
        // one job one day — it doesn't mean they're going to be there the next
        // day"). 'remaining' wrote a ledger row for EVERY day to the job's end
        // date, so one drag pencilled Devin onto Parkk Concrete for 28
        // consecutive days through Sep 3 — an assertion no one had made. Days
        // with no ledger row fall back to the job's lead, so the job still
        // stays covered; the office just states each day it actually means.
        // 'remaining' remains available, but only when explicitly asked for.
        scope: scope === 'remaining' ? 'remaining' : 'day',
        position: position === 'first' ? 'first' : 'last',
        tenantId,
        actor: { userId: auth.userId, userEmail: auth.userEmail, role: auth.role },
        request,
        force,
      });

      if (!result.ok) {
        return NextResponse.json(
          {
            error: result.error,
            ...(result.details ? { details: result.details } : {}),
            ...(result.conflict_job_id ? { conflict_job_id: result.conflict_job_id } : {}),
            ...(result.block_type ? { block_type: result.block_type } : {}),
          },
          { status: result.status }
        );
      }

      const seqNote =
        operatorId && result.operator_day_job_count > 1
          ? ` (operator's ${ordinal(result.day_sequence)} job that day)`
          : '';
      // The message must reflect the CREW, not just the operator seat. A
      // helper-only assignment is a real assignment (founder, Aug 13) and
      // reporting it as "unassigned" told the office the opposite of what had
      // just happened.
      const someoneIsOnIt = !!result.job.assigned_to || !!result.job.helper_assigned_to;
      // SAY WHAT CAME OFF. The office pressed one control and three jobs lost
      // their operator with nothing in the response to say so — the board kept
      // drawing the old name until the next refetch. A crew clear is now part
      // of the answer, not something the caller has to diff for.
      const notice = result.crew_change.operator_cleared || result.crew_change.helper_cleared
        ? `${[
            result.crew_change.operator_cleared ? 'operator' : null,
            result.crew_change.helper_cleared ? 'helper' : null,
          ].filter(Boolean).join(' and ')} removed — check this job still has who it needs.`
        : null;
      return NextResponse.json({
        success: true,
        message: `Job ${someoneIsOnIt ? 'assigned' : 'unassigned'} successfully${seqNote}`,
        ...(notice ? { notice } : {}),
        data: {
          ...result.job,
          day_sequence: result.day_sequence,
          operator_day_job_count: result.operator_day_job_count,
          sequences: result.sequences,
          crew_change: result.crew_change,
        },
      });
    }

    // ── Legacy path: no date provided — update job_orders directly ─────────
    // (Kept for old callers; still status-guarded so a live job is never
    // downgraded or re-stamped.)
    const { data: currentJob } = await supabaseAdmin
      .from('job_orders')
      .select('id, job_number, status, assigned_to, helper_assigned_to')
      .eq('id', jobOrderId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (!currentJob) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Same tri-state as the per-day path: an omitted operator keeps the lead.
    const effectiveOperatorId: string | null =
      operatorId === undefined ? (currentJob.assigned_to ?? null) : operatorId;
    // …and an omitted helper keeps the job's helper. There is no ledger row on
    // this path by definition (no assignment_date), so the job row IS the
    // present state here.
    const effectiveHelperId: string | null =
      helperId === undefined ? (currentJob.helper_assigned_to ?? null) : helperId;

    // Same live-job guard as the per-day path — a legacy caller must not be a
    // way around it.
    if (
      !force &&
      crewClearNeedsConfirmation({
        status: currentJob.status,
        prevOperatorId: currentJob.assigned_to ?? null,
        prevHelperId: currentJob.helper_assigned_to ?? null,
        nextOperatorId: effectiveOperatorId,
        nextHelperId: effectiveHelperId,
      })
    ) {
      return NextResponse.json(
        {
          error: 'This job has a crew on it right now.',
          details: crewClearBlockedMessage(currentJob.job_number, currentJob.status),
          block_type: 'live_job_unassign',
        },
        { status: 409 }
      );
    }

    const updateData: Record<string, unknown> = {
      assigned_to: effectiveOperatorId,
      helper_assigned_to: effectiveHelperId,
      updated_at: new Date().toISOString(),
    };

    // STATUS GUARD: promote only pre-work statuses; never downgrade a live job.
    if (shouldPromoteToAssigned(currentJob.status, effectiveOperatorId, effectiveHelperId)) {
      updateData.status = 'assigned';
      updateData.assigned_at = new Date().toISOString();
    } else if (shouldDowngradeToScheduled(currentJob.status, effectiveOperatorId, effectiveHelperId)) {
      updateData.status = 'scheduled';
      updateData.assigned_at = null;
    }

    const assignQuery = supabaseAdmin
      .from('job_orders')
      .update(updateData)
      .eq('id', jobOrderId)
      .eq('tenant_id', tenantId);
    const { data: updated, error } = await assignQuery
      .select('id, job_number, customer_name, assigned_to, helper_assigned_to, status')
      .single();

    if (error) {
      console.error('Error assigning job:', error);
      return NextResponse.json(
        { error: 'Failed to assign job' },
        { status: 500 }
      );
    }

    // Audit log: job assignment (legacy path — the per-day path audits inside
    // applyReassignment).
    logAuditEvent({
      userId: auth.userId,
      userEmail: auth.userEmail,
      userRole: auth.role,
      action: effectiveOperatorId || effectiveHelperId ? 'assign' : 'unassign',
      resourceType: 'job_order',
      resourceId: jobOrderId,
      details: { operatorId: effectiveOperatorId, helperId: effectiveHelperId, jobNumber: updated?.job_number },
      request,
    });

    // Fire-and-forget: notify assigned operator via in-app notification
    if (effectiveOperatorId && updated) {
      Promise.resolve((async () => {
        const { data: job } = await supabaseAdmin
          .from('job_orders')
          .select('customer_name, location, scheduled_date, arrival_time, job_type')
          .eq('id', jobOrderId)
          .single();

        const scheduledDate = job?.scheduled_date
          ? new Date(job.scheduled_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
          : 'TBD';

        const msg = job
          ? `${job.customer_name} at ${job.location || 'TBD'} on ${scheduledDate}.`
          : `Job ${updated!.job_number} has been assigned to you.`;

        await supabaseAdmin.from('schedule_notifications').insert({
          recipient_id: effectiveOperatorId,
          job_order_id: jobOrderId,
          type: 'job_assigned',
          title: `You've been assigned: ${updated!.job_number}`,
          message: msg,
          metadata: {
            job_number: updated!.job_number,
            customer_name: job?.customer_name,
            location: job?.location,
            scheduled_date: job?.scheduled_date,
            arrival_time: job?.arrival_time,
            job_type: job?.job_type,
          },
        });
      })()).catch(() => {});
    }

    // Fire-and-forget: notify assigned helper
    if (effectiveHelperId && updated) {
      Promise.resolve((async () => {
        const { data: job } = await supabaseAdmin
          .from('job_orders')
          .select('customer_name, location, scheduled_date, arrival_time')
          .eq('id', jobOrderId)
          .single();

        const scheduledDate = job?.scheduled_date
          ? new Date(job.scheduled_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
          : 'TBD';

        await supabaseAdmin.from('schedule_notifications').insert({
          recipient_id: effectiveHelperId,
          job_order_id: jobOrderId,
          type: 'job_assigned',
          title: `You've been assigned as helper: ${updated!.job_number}`,
          message: job
            ? `${job.customer_name} at ${job.location || 'TBD'} on ${scheduledDate} (helper role).`
            : `Job ${updated!.job_number} — assigned as helper.`,
          metadata: {
            job_number: updated!.job_number,
            is_helper: true,
          },
        });
      })()).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      message: 'Job assigned successfully',
      data: updated,
    });
  } catch (error) {
    console.error('Unexpected error in POST /api/admin/schedule-board/assign:', error);
    logApiError({ endpoint: '/api/admin/schedule-board/assign', method: 'POST', error: error as Error, userId: undefined, request });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
