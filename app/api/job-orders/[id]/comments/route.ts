export const dynamic = 'force-dynamic';

/**
 * GET /api/job-orders/[id]/comments
 *
 * STAFF-side customer-comments thread for a job (Feature A of the customer
 * portal: 2-way comms). Returns BOTH customer and staff comments for the job,
 * oldest-first.
 *
 * Auth: `requireScheduleBoardAccess` (admin / super_admin / operations_manager /
 * salesman — matches the staff-side authz used by the notes route).
 *
 * Tenant scoping is enforced IN CODE (we use supabaseAdmin which bypasses RLS):
 * the job is verified to belong to the caller's tenant first (404 otherwise),
 * then comments are filtered by both job_order_id and tenant_id.
 *
 * `created_ip` is NEVER selected/returned.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireScheduleBoardAccess } from '@/lib/api-auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireScheduleBoardAccess(request);
    if (!auth.authorized) return auth.response;

    const { id: jobOrderId } = await params;

    // Verify the job belongs to the caller's tenant (404 if not / not found).
    const { data: job, error: jobError } = await supabaseAdmin
      .from('job_orders')
      .select('id, tenant_id')
      .eq('id', jobOrderId)
      .maybeSingle();

    if (jobError) {
      console.error('Error loading job for comments:', jobError);
      return NextResponse.json({ error: 'Failed to load job' }, { status: 500 });
    }

    if (!job || (auth.tenantId && job.tenant_id !== auth.tenantId)) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Explicit column list — never expose created_ip.
    let query = supabaseAdmin
      .from('customer_comments')
      .select(
        'id, tenant_id, job_order_id, portal_token_id, author_kind, author_user_id, author_name, body, is_hidden, created_at'
      )
      .eq('job_order_id', jobOrderId)
      .order('created_at', { ascending: true });

    // Defense-in-depth: also scope by tenant (job already verified above).
    if (auth.tenantId) query = query.eq('tenant_id', auth.tenantId);

    const { data: comments, error } = await query;

    if (error) {
      console.error('Error fetching customer comments:', error);
      return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: comments || [] });
  } catch (error) {
    console.error('Unexpected error in GET /api/job-orders/[id]/comments:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
