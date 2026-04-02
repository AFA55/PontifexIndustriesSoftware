/**
 * API Route: /api/job-orders/[id]
 * GET    — authenticated; fetch a single job order
 * DELETE — admin only; delete a job order
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getTenantId } from '@/lib/get-tenant-id';
import { requireAuth } from '@/lib/api-auth';

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
