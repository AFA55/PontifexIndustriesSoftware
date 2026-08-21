export const dynamic = 'force-dynamic';

/**
 * API Route: /api/job-orders/[id]
 * GET    — authenticated; fetch a single job order
 * PATCH  — schedule board access; update editable fields
 * DELETE — admin only; delete a job order
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getTenantId } from '@/lib/get-tenant-id';
import { requireAuth, requireScheduleBoardAccess } from '@/lib/api-auth';
import { filterJobEditFields, describeJobEditError } from '@/lib/job-edit-fields';
import { releaseParkedJobFields, schedulingDatesMoving } from '@/lib/job-phases';
import { attachPhaseDayNumbers, tenantLocalToday } from '@/lib/phase-day-server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;
    const { id } = await params;
    // Fetch full job row — no profile join (assigned_to may reference auth.users not profiles)
    let query = supabaseAdmin
      .from('job_orders')
      .select('*')
      .eq('id', id);
    // Only apply tenant filter if tenantId is set (super_admin may have none)
    if (auth.tenantId) query = query.eq('tenant_id', auth.tenantId);
    const { data, error } = await query.single();
    if (error || !data) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    // Separately look up operator name if assigned_to is set
    let operatorProfile = null;
    if (data.assigned_to) {
      const { data: prof } = await supabaseAdmin
        .from('profiles')
        .select('full_name, role')
        .eq('id', data.assigned_to)
        .maybeSingle();
      operatorProfile = prof;
    }
    // day-complete prints "Multi-day job • Day N" off this payload and derived
    // it as `total_days_worked + 1` — the LIFETIME count, which is the wrong
    // number the moment a job has been parked and restarted. Adds
    // `phase_day_number` / `phase_number` ONLY when the job has rows in
    // `job_phases`; anything else is left byte-for-byte as it was, and nothing
    // in here can throw. See lib/phase-day-server.ts.
    //
    // The tenant's calendar day is passed as a THUNK, not awaited here: this is
    // the operator's job-detail load, and resolving it eagerly spent a `tenants`
    // select before the `job_phases` read had shown it was needed — two
    // sequential round trips on the hot path, one of them a guaranteed miss
    // while the migration is unapplied. It is resolved only for a job that
    // actually has phases.
    const job: Record<string, any> = { ...data, profiles: operatorProfile };
    await attachPhaseDayNumbers([job], () => tenantLocalToday(auth.tenantId));

    return NextResponse.json({ success: true, data: job });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireScheduleBoardAccess(request);
    if (!auth.authorized) return auth.response;

    const { id } = await params;
    const body = await request.json();

    // Rebuild the update from the KNOWN editable columns (lib/job-edit-fields.ts).
    // A PostgREST update is all-or-nothing: one phantom key rejects the whole
    // statement and every field silently fails to save. Unknown keys are
    // dropped + logged instead of poisoning the save.
    const { updates: updateData, dropped } = filterJobEditFields(body);

    if (dropped.length > 0) {
      console.warn(
        `[PATCH /api/job-orders/${id}] ignored ${dropped.length} non-editable field(s): ${dropped.join(', ')}`
      );
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    // Coerce estimated_cost to float
    if ('estimated_cost' in updateData && updateData.estimated_cost !== null && updateData.estimated_cost !== '') {
      updateData.estimated_cost = parseFloat(String(updateData.estimated_cost));
    } else if (updateData.estimated_cost === '') {
      updateData.estimated_cost = null;
    }

    // Empty date strings must become NULL (a '' would throw on a date column and
    // fail the whole all-or-nothing update — the classic "edit doesn't save").
    if ('scheduled_date' in updateData && !updateData.scheduled_date) updateData.scheduled_date = null;
    if ('end_date' in updateData && !updateData.end_date) updateData.end_date = null;

    // Keep scheduled_end_date in sync with end_date so a date change from the
    // board propagates to capacity / skill-match / multi-day surfaces that read
    // scheduled_end_date (the dedicated /schedule route already does this).
    if ('end_date' in updateData) {
      updateData.scheduled_end_date = updateData.end_date || null;
    }

    updateData.updated_at = new Date().toISOString();

    // Re-dating or re-crewing a parked job un-parks it. Same rule and same
    // helper as the admin PATCH, the schedule route and the two crewing
    // routes — the board's inline editor is not a way around it.
    //
    // Taking the last man off it is NOT re-crewing it, and the dates are
    // compared against the row rather than read off the body, because this
    // editor resubmits the date it already had. Both are the same precondition:
    // somebody is on the job after this write, or the job actually got a date.
    if (
      ['scheduled_date', 'end_date', 'scheduled_end_date', 'assigned_to', 'helper_assigned_to'].some(
        (f) => f in updateData
      )
    ) {
      const { data: parkState } = await supabaseAdmin
        .from('job_orders')
        .select(
          'status, assigned_to, helper_assigned_to, scheduled_date, end_date, scheduled_end_date, on_hold, on_hold_placed_at, on_hold_released_at'
        )
        .eq('id', id)
        .eq('tenant_id', auth.tenantId)
        .maybeSingle();
      if (parkState) {
        Object.assign(
          updateData,
          releaseParkedJobFields({
            job: parkState,
            operatorId: ('assigned_to' in updateData
              ? updateData.assigned_to
              : parkState.assigned_to) as string | null,
            helperId: ('helper_assigned_to' in updateData
              ? updateData.helper_assigned_to
              : parkState.helper_assigned_to) as string | null,
            scheduling: schedulingDatesMoving(updateData, parkState),
          })
        );
      }
    }

    const { data, error } = await supabaseAdmin
      .from('job_orders')
      .update(updateData)
      .eq('id', id)
      .eq('tenant_id', auth.tenantId)
      .select()
      .single();

    if (error) {
      // Name the offending column when PostgREST/PG rejects an unknown field,
      // so a phantom column is diagnosable from the UI instead of opaque.
      console.error(`[PATCH /api/job-orders/${id}] update failed:`, error);
      return NextResponse.json({ error: describeJobEditError(error) }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Await params (Next.js 15 requirement)
    const { id: jobId } = await params;

    // Get user from Supabase session
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    // Verify the token and get user
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    // Check if user is admin
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!['admin', 'super_admin', 'operations_manager'].includes(profile?.role || '')) {
      return NextResponse.json(
        { error: 'Forbidden. Admin access required.' },
        { status: 403 }
      );
    }

    // Scope delete to tenant — non-super-admins must have a resolved tenantId
    const tenantId = await getTenantId(user.id);
    if (!tenantId && profile?.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Tenant context required' },
        { status: 403 }
      );
    }
    let deleteQuery = supabaseAdmin
      .from('job_orders')
      .delete()
      .eq('id', jobId);
    if (tenantId) deleteQuery = deleteQuery.eq('tenant_id', tenantId);

    // Delete the job order
    const { error: deleteError } = await deleteQuery;

    if (deleteError) {
      console.error('Error deleting job order:', deleteError);
      return NextResponse.json(
        { success: false, error: deleteError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Job order deleted successfully'
    });

  } catch (error) {
    console.error('Error in DELETE /api/job-orders/[id]:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
