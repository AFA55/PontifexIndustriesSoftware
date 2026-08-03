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
    return NextResponse.json({ success: true, data: { ...data, profiles: operatorProfile } });
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
