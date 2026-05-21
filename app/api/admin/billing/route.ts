export const dynamic = 'force-dynamic';

/**
 * API Route: GET /api/admin/billing
 *
 * Returns the data needed by the billing page:
 *   - invoices list (already served by /api/admin/invoices, but this endpoint
 *     also returns completed jobs + profiles in one call)
 *   - completedJobs — completed job_orders with a flag indicating whether an
 *     invoice line item already exists for each job
 *   - profilesById — map of user-id -> full_name for "Submitted by" chips
 *
 * All queries use supabaseAdmin with an explicit tenant_id filter so that
 * tenant isolation does NOT rely solely on RLS.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireSalesStaff } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSalesStaff(request);
    if (!auth.authorized) return auth.response;

    const callerTenantId = await getTenantId(auth.userId);

    // super_admin can pass ?tenantId= to scope to a specific tenant
    let tenantId: string | null = callerTenantId;
    if (!tenantId && auth.role === 'super_admin') {
      const { searchParams } = new URL(request.url);
      tenantId = searchParams.get('tenantId') || searchParams.get('tenant_id');
    }

    if (!tenantId && auth.role !== 'super_admin') {
      return NextResponse.json({ error: 'Tenant scope required.' }, { status: 400 });
    }

    // ── 1. Completed jobs ────────────────────────────────────────────────────
    let jobsQuery = supabaseAdmin
      .from('job_orders')
      .select(
        'id, job_number, title, customer_name, estimated_cost, work_completed_at, status, billing_type, created_by, completion_pdf_url'
      )
      .eq('status', 'completed')
      .is('deleted_at', null)
      .order('work_completed_at', { ascending: false })
      .limit(50);

    // Explicit tenant filter — do NOT rely on RLS alone
    if (tenantId) {
      jobsQuery = jobsQuery.eq('tenant_id', tenantId);
    }

    // RBAC: salesman only sees jobs they created
    if (auth.role === 'salesman') {
      jobsQuery = jobsQuery.eq('created_by', auth.userId);
    }

    const { data: completedJobs, error: jobsError } = await jobsQuery;

    if (jobsError) {
      console.error('Error fetching completed jobs:', jobsError);
      return NextResponse.json({ error: 'Failed to fetch completed jobs.' }, { status: 500 });
    }

    const jobs = completedJobs || [];

    // ── 2. Which jobs already have invoice line items? ───────────────────────
    let completedJobsWithFlag: Array<(typeof jobs)[0] & { has_invoice: boolean }> = [];

    if (jobs.length > 0) {
      const jobIds = jobs.map((j) => j.id);

      const { data: existingLineItems, error: liError } = await supabaseAdmin
        .from('invoice_line_items')
        .select('job_order_id')
        .in('job_order_id', jobIds);

      if (liError) {
        console.error('Error fetching invoice line items:', liError);
        // Non-fatal: continue without has_invoice info (all flagged as uninvoiced)
      }

      const invoicedJobIds = new Set(
        (existingLineItems || []).map((li: any) => li.job_order_id)
      );

      completedJobsWithFlag = jobs.map((j) => ({
        ...j,
        has_invoice: invoicedJobIds.has(j.id),
      }));
    }

    // ── 3. Resolve "Submitted by" profile names ──────────────────────────────
    const creatorIds = new Set<string>();
    for (const j of completedJobsWithFlag) {
      if (j.created_by) creatorIds.add(j.created_by);
    }

    let profilesById: Record<string, string> = {};

    if (creatorIds.size > 0) {
      const { data: profiles, error: profError } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name')
        .in('id', Array.from(creatorIds));

      if (profError) {
        console.error('Error fetching profiles:', profError);
        // Non-fatal — chips will simply not render for unresolved ids
      }

      for (const p of profiles || []) {
        if (p?.id) profilesById[p.id] = (p as any).full_name || '';
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        completedJobs: completedJobsWithFlag,
        profilesById,
      },
    });
  } catch (error: any) {
    console.error('Error in billing GET:', error);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
