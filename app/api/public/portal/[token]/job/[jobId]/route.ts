export const dynamic = 'force-dynamic';

/**
 * API Route: GET /api/public/portal/[token]/job/[jobId]
 * PUBLIC — No auth required.
 * Validates a customer portal token, then returns full job details + work items + daily logs
 * for rendering a completed job ticket view.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; jobId: string }> }
) {
  try {
    const { token, jobId } = await params;

    if (!token || typeof token !== 'string' || token.length < 16) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
    }

    if (!jobId || typeof jobId !== 'string') {
      return NextResponse.json({ error: 'Invalid job ID' }, { status: 400 });
    }

    // Validate the portal token
    const { data: portalToken, error: tokenError } = await supabaseAdmin
      .from('customer_portal_tokens')
      .select('id, tenant_id, customer_name, customer_email, expires_at')
      .eq('token', token)
      .maybeSingle();

    if (tokenError || !portalToken) {
      return NextResponse.json({ error: 'Invalid or expired portal link' }, { status: 404 });
    }

    if (new Date(portalToken.expires_at) < new Date()) {
      return NextResponse.json({ error: 'expired', message: 'This portal link has expired' }, { status: 410 });
    }

    // Fetch the job — must belong to the same tenant
    const { data: job, error: jobError } = await supabaseAdmin
      .from('job_orders')
      .select(
        'id, job_number, project_name, customer_name, customer_email, job_type, address, location, ' +
        'description, scope_of_work, scheduled_date, status, assigned_to, helper_assigned_to, ' +
        'tenant_id, total_cost, customer_signature, customer_signed_at, customer_signature_method, ' +
        'completed_at, work_completed_at, completion_pdf_url, completion_signer_name, ' +
        'in_route_at, arrived_at_jobsite_at, work_started_at, total_hours_worked, total_days_worked'
      )
      .eq('id', jobId)
      .eq('tenant_id', portalToken.tenant_id)
      .maybeSingle();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const jobRow = job as any;

    // Verify this customer can access the job
    // Allow if: customer_email matches token OR customer_name matches token (case-insensitive)
    // OR the token itself was pinned to this job_order_id
    const { data: tokenRow } = await supabaseAdmin
      .from('customer_portal_tokens')
      .select('job_order_id')
      .eq('token', token)
      .maybeSingle();

    const isPinnedJob = tokenRow?.job_order_id === jobId;
    const emailMatch =
      portalToken.customer_email &&
      jobRow.customer_email &&
      portalToken.customer_email.toLowerCase() === jobRow.customer_email.toLowerCase();
    const nameMatch =
      portalToken.customer_name &&
      jobRow.customer_name &&
      portalToken.customer_name.toLowerCase() === (jobRow.customer_name as string).toLowerCase();

    if (!isPinnedJob && !emailMatch && !nameMatch) {
      return NextResponse.json({ error: 'Access denied to this job' }, { status: 403 });
    }

    // Fetch operator profile (assigned_to is an auth.users id)
    let operatorName: string | null = null;
    if (jobRow.assigned_to) {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('full_name')
        .eq('id', jobRow.assigned_to)
        .maybeSingle();
      operatorName = profile?.full_name || null;
    }

    // Fetch work items
    const { data: workItems } = await supabaseAdmin
      .from('work_items')
      .select('work_type, quantity, notes, core_quantity, core_size, linear_feet_cut, created_at')
      .eq('job_order_id', jobId)
      .order('created_at', { ascending: true });

    // Fetch daily logs
    const { data: dailyLogs } = await supabaseAdmin
      .from('daily_job_logs')
      .select('log_date, day_number, hours_worked, work_performed, notes, created_at')
      .eq('job_order_id', jobId)
      .order('log_date', { ascending: true });

    // Fetch change orders if table exists
    let changeOrders: any[] = [];
    const { data: coData, error: coError } = await supabaseAdmin
      .from('change_orders')
      .select('co_number, description, status, amount, requested_at, approved_at')
      .eq('job_order_id', jobId)
      .order('requested_at', { ascending: true });

    if (!coError) {
      changeOrders = coData || [];
    }

    // Fetch tenant branding for display
    let tenantName = 'Service Provider';
    let tenantLogoUrl: string | null = null;
    let tenantPrimaryColor: string | null = null;

    const { data: branding } = await supabaseAdmin
      .from('tenant_branding')
      .select('company_name, logo_url, primary_color')
      .eq('tenant_id', portalToken.tenant_id)
      .maybeSingle();

    if (branding) {
      tenantName = branding.company_name || tenantName;
      tenantLogoUrl = branding.logo_url || null;
      tenantPrimaryColor = branding.primary_color || null;
    } else {
      const { data: tenant } = await supabaseAdmin
        .from('tenants')
        .select('name')
        .eq('id', portalToken.tenant_id)
        .maybeSingle();
      if (tenant?.name) tenantName = tenant.name;
    }

    return NextResponse.json({
      success: true,
      data: {
        job: {
          ...jobRow,
          operator_name: operatorName,
        },
        work_items: workItems || [],
        daily_logs: dailyLogs || [],
        change_orders: changeOrders,
        tenant: {
          name: tenantName,
          logo_url: tenantLogoUrl,
          primary_color: tenantPrimaryColor,
        },
      },
    });
  } catch (error: any) {
    console.error('Error in public portal job GET:', error);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
