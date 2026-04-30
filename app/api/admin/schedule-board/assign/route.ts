export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/schedule-board/assign
 * Assign an operator and/or helper to a job order.
 * When assignment_date is provided, writes a per-day record to job_daily_assignments
 * so that changing/unassigning on one day does not affect other days of a multi-day job.
 * Access: super_admin only
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireScheduleBoardAccess } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';
import { logAuditEvent } from '@/lib/audit';
import { logApiError } from '@/lib/error-logger';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireScheduleBoardAccess(request);
    if (!auth.authorized) return auth.response;

    const tenantId = await getTenantId(auth.userId);

    if (!tenantId) return NextResponse.json({ error: 'Tenant scope required. super_admin must pass ?tenantId=' }, { status: 400 });
    const body = await request.json();
    const { jobOrderId, operatorId, helperId, assignment_date } = body;

    if (!jobOrderId) {
      return NextResponse.json(
        { error: 'Missing required field: jobOrderId' },
        { status: 400 }
      );
    }

    let updated: { id: string; job_number: string; customer_name: string; assigned_to: string | null; helper_assigned_to: string | null; status: string } | null = null;

    if (assignment_date) {
      // ── Per-day assignment path ──────────────────────────────────────────
      // 1. Look up names for history record
      let operatorName: string | null = null;
      let helperName: string | null = null;

      if (operatorId) {
        const { data: op } = await supabaseAdmin
          .from('profiles')
          .select('full_name')
          .eq('id', operatorId)
          .single();
        operatorName = op?.full_name ?? null;
      }
      if (helperId) {
        const { data: hlp } = await supabaseAdmin
          .from('profiles')
          .select('full_name')
          .eq('id', helperId)
          .single();
        helperName = hlp?.full_name ?? null;
      }

      // 2. Upsert the per-day record
      await supabaseAdmin.from('job_daily_assignments').upsert(
        {
          job_order_id: jobOrderId,
          assignment_date,
          operator_id: operatorId ?? null,
          helper_id: helperId ?? null,
          operator_name: operatorName,
          helper_name: helperName,
          assigned_by: auth.userId,
          tenant_id: tenantId ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'job_order_id,assignment_date' }
      );

      // 3. Fetch job to decide whether to touch job_orders.assigned_to
      //    (tenant-scoped — prevents cross-tenant assignment via guessed UUID)
      let jobLookup = supabaseAdmin
        .from('job_orders')
        .select('id, job_number, customer_name, assigned_to, helper_assigned_to, status, scheduled_date, end_date')
        .eq('id', jobOrderId);
      if (tenantId) jobLookup = jobLookup.eq('tenant_id', tenantId);
      const { data: job } = await jobLookup.single();

      const isMultiDay =
        job?.end_date != null && job.end_date !== job?.scheduled_date;

      // Only write to job_orders if this is a single-day job OR the job has never been assigned
      if (!isMultiDay || !job?.assigned_to) {
        const updateData: Record<string, unknown> = {
          assigned_to: operatorId ?? null,
          helper_assigned_to: helperId ?? null,
          updated_at: new Date().toISOString(),
        };
        if (operatorId) {
          updateData.status = 'assigned';
          updateData.assigned_at = new Date().toISOString();
        } else {
          updateData.status = 'scheduled';
          updateData.assigned_at = null;
        }

        const q = supabaseAdmin.from('job_orders').update(updateData).eq('id', jobOrderId).eq('tenant_id', tenantId);
        const { data: u } = await q
          .select('id, job_number, customer_name, assigned_to, helper_assigned_to, status')
          .single();
        updated = u ?? null;
      } else {
        updated = {
          id: job.id,
          job_number: job.job_number,
          customer_name: job.customer_name,
          assigned_to: job.assigned_to,
          helper_assigned_to: job.helper_assigned_to,
          status: job.status,
        };
      }
    } else {
      // ── Legacy path: no date provided — update job_orders directly ───────
      const updateData: Record<string, unknown> = {
        assigned_to: operatorId || null,
        helper_assigned_to: helperId || null,
        updated_at: new Date().toISOString(),
      };

      if (operatorId) {
        updateData.status = 'assigned';
        updateData.assigned_at = new Date().toISOString();
      } else {
        updateData.status = 'scheduled';
        updateData.assigned_at = null;
      }

      const assignQuery = supabaseAdmin
        .from('job_orders')
        .update(updateData)
        .eq('id', jobOrderId)
        .eq('tenant_id', tenantId);
      const { data: u, error } = await assignQuery
        .select('id, job_number, customer_name, assigned_to, helper_assigned_to, status')
        .single();

      if (error) {
        console.error('Error assigning job:', error);
        return NextResponse.json(
          { error: 'Failed to assign job' },
          { status: 500 }
        );
      }
      updated = u ?? null;
    }

    // Audit log: job assignment
    logAuditEvent({
      userId: auth.userId,
      userEmail: auth.userEmail,
      userRole: auth.role,
      action: operatorId ? 'assign' : 'unassign',
      resourceType: 'job_order',
      resourceId: jobOrderId,
      details: { operatorId, helperId, assignment_date, jobNumber: updated?.job_number },
      request,
    });

    // Fire-and-forget: notify assigned operator via in-app notification
    if (operatorId && updated) {
      Promise.resolve((async () => {
        // Fetch the full job to build a meaningful message
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
            scheduled_date: assignment_date ?? job?.scheduled_date,
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
