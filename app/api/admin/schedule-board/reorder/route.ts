export const dynamic = 'force-dynamic';

/**
 * PATCH /api/admin/schedule-board/reorder
 * Move a job from one operator to another (reassign) and/or update board_sort_position.
 * Body: { jobOrderId, newOperatorId?, newHelperId?, board_sort_position?, assignment_date?, scope?, position? }
 *   — OR (dnd-kit format): { jobId, newOperatorId?, board_sort_position? }
 *
 * Assignment changes are routed through lib/reassign.ts (the SAME write path
 * as /assign) so per-day ledger + sequencing + status-guard semantics cannot
 * drift between the two routes. Sort position stays a plain column update.
 *
 * Access: super_admin only
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireSuperAdmin } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';
import { applyReassignment, shouldPromoteToAssigned, shouldDowngradeToScheduled } from '@/lib/reassign';

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireSuperAdmin(request);
    if (!auth.authorized) return auth.response;

    const tenantId = auth.tenantId || (await getTenantId(auth.userId));
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant scope required.' }, { status: 400 });
    }

    const body = await request.json();
    // Support both naming conventions
    const jobOrderId = body.jobOrderId || body.jobId;
    const { newOperatorId, newHelperId, board_sort_position, assignment_date, scope, position } = body;

    if (!jobOrderId) {
      return NextResponse.json(
        { error: 'Missing required field: jobOrderId or jobId' },
        { status: 400 }
      );
    }

    let reassigned: Record<string, unknown> | null = null;

    // ── Assignment change → the shared reassignment write path ─────────────
    if (newOperatorId !== undefined) {
      if (assignment_date) {
        const result = await applyReassignment({
          jobOrderId,
          operatorId: newOperatorId || null,
          // undefined = preserve the job's current helper when the drag didn't
          // carry one; explicit null clears it.
          helperId: newHelperId === undefined ? undefined : newHelperId || null,
          assignmentDate: assignment_date,
          // Defaults to 'day' — see the note in /assign. A drag on the board
          // states who is on the job THAT day, not for the rest of its span.
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
              ...(result.block_type ? { block_type: result.block_type } : {}),
            },
            { status: result.status }
          );
        }
        reassigned = {
          ...result.job,
          day_sequence: result.day_sequence,
          operator_day_job_count: result.operator_day_job_count,
        };
      } else {
        // Legacy (no date supplied): direct job_orders write — tenant-scoped
        // and status-guarded (never downgrade a live job).
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
          assigned_to: newOperatorId || null,
          updated_at: new Date().toISOString(),
        };
        if (newHelperId !== undefined) {
          updateData.helper_assigned_to = newHelperId || null;
        }
        if (shouldPromoteToAssigned(currentJob.status, newOperatorId || null)) {
          updateData.status = 'assigned';
        } else if (shouldDowngradeToScheduled(currentJob.status, newOperatorId || null)) {
          updateData.status = 'scheduled';
        }

        const { data: updated, error } = await supabaseAdmin
          .from('job_orders')
          .update(updateData)
          .eq('id', jobOrderId)
          .eq('tenant_id', tenantId)
          .select('id, job_number, customer_name, assigned_to, helper_assigned_to, status, board_sort_position')
          .single();

        if (error) {
          console.error('Error reordering job:', error);
          return NextResponse.json({ error: 'Failed to reorder job' }, { status: 500 });
        }
        reassigned = updated;
      }
    }

    // ── Sort position (independent of assignment) ───────────────────────────
    if (board_sort_position !== undefined && typeof board_sort_position === 'number') {
      const { data: sorted, error: sortError } = await supabaseAdmin
        .from('job_orders')
        .update({ board_sort_position, updated_at: new Date().toISOString() })
        .eq('id', jobOrderId)
        .eq('tenant_id', tenantId)
        .select('id, job_number, customer_name, assigned_to, helper_assigned_to, status, board_sort_position')
        .single();

      if (sortError) {
        console.error('Error updating board_sort_position:', sortError);
        return NextResponse.json({ error: 'Failed to reorder job' }, { status: 500 });
      }
      reassigned = { ...(reassigned || {}), ...sorted };
    }

    if (!reassigned) {
      return NextResponse.json(
        { error: 'Nothing to update — provide newOperatorId and/or board_sort_position' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Job reassigned successfully',
      data: reassigned,
    });
  } catch (error) {
    console.error('Unexpected error in PATCH /api/admin/schedule-board/reorder:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
