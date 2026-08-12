export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/schedule-board/assign
 * THE write path for assigning/reassigning an operator and/or helper.
 *
 * Body: {
 *   jobOrderId: string,
 *   operatorId: string | null,
 *   helperId?: string | null,
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

export async function POST(request: NextRequest) {
  try {
    const auth = await requireScheduleBoardAccess(request);
    if (!auth.authorized) return auth.response;

    const tenantId = await getTenantId(auth.userId);

    if (!tenantId) return NextResponse.json({ error: 'Tenant scope required. super_admin must pass ?tenantId=' }, { status: 400 });
    const body = await request.json();
    const { jobOrderId, operatorId, helperId, assignment_date, scope, position } = body;

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
        operatorId: operatorId || null,
        helperId: helperId ?? null,
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
      return NextResponse.json({
        success: true,
        message: `Job ${operatorId ? 'assigned' : 'unassigned'} successfully${seqNote}`,
        data: {
          ...result.job,
          day_sequence: result.day_sequence,
          operator_day_job_count: result.operator_day_job_count,
          sequences: result.sequences,
        },
      });
    }

    // ── Legacy path: no date provided — update job_orders directly ─────────
    // (Kept for old callers; still status-guarded so a live job is never
    // downgraded or re-stamped.)
    const { data: currentJob } = await supabaseAdmin
      .from('job_orders')
      .select('id, status')
      .eq('id', jobOrderId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (!currentJob) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {
      assigned_to: operatorId || null,
      helper_assigned_to: helperId || null,
      updated_at: new Date().toISOString(),
    };

    // STATUS GUARD: promote only pre-work statuses; never downgrade a live job.
    if (shouldPromoteToAssigned(currentJob.status, operatorId || null)) {
      updateData.status = 'assigned';
      updateData.assigned_at = new Date().toISOString();
    } else if (shouldDowngradeToScheduled(currentJob.status, operatorId || null)) {
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
      action: operatorId ? 'assign' : 'unassign',
      resourceType: 'job_order',
      resourceId: jobOrderId,
      details: { operatorId, helperId, jobNumber: updated?.job_number },
      request,
    });

    // Fire-and-forget: notify assigned operator via in-app notification
    if (operatorId && updated) {
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
          recipient_id: operatorId,
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
    if (helperId && updated) {
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
          recipient_id: helperId,
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
