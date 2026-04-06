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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;
    const { id } = await params;
    const { data, error } = await supabaseAdmin
      .from('job_orders')
      .select('*, profiles!job_orders_assigned_to_fkey(full_name, role)')
      .eq('id', id)
      .eq('tenant_id', auth.tenantId)
      .single();
    if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true, data });
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

    // Allowlist of updatable fields
    const ALLOWED_FIELDS = [
      'customer_name', 'customer_contact', 'site_contact_phone', 'foreman_phone',
      'address', 'location', 'estimated_cost', 'po_number', 'salesman_name',
      'scheduled_date', 'end_date', 'arrival_time', 'description', 'additional_info',
      'directions', 'jobsite_conditions', 'site_compliance', 'job_type', 'is_will_call',
      'scope_details', 'equipment_needed', 'equipment_rentals',
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: Record<string, any> = {};
    for (const key of ALLOWED_FIELDS) {
      if (key in body) updateData[key] = body[key];
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

    updateData.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('job_orders')
      .update(updateData)
      .eq('id', id)
      .eq('tenant_id', auth.tenantId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

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

    // Scope delete to tenant
    const tenantId = await getTenantId(user.id);
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
