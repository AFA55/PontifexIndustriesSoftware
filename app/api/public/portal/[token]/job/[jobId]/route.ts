export const dynamic = 'force-dynamic';

/**
 * API Route: GET /api/public/portal/[token]/job/[jobId]
 * PUBLIC — No auth required.
 * Validates a customer portal token, then returns full job details + work items + daily logs
 * for rendering a completed job ticket view.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { stripInternalNotes } from '@/lib/work-items-format';
import { computeEta } from '@/lib/eta';

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
        // NOTE: `scope_of_work` and `completed_at` DO NOT EXIST on job_orders.
        // Naming them made PostgREST reject the WHOLE select, so every customer
        // who tapped a job in their portal got "Job Not Found". The real
        // columns are `scope_details` (jsonb) and `work_completed_at`.
        'description, scope_details, scheduled_date, end_date, status, assigned_to, helper_assigned_to, ' +
        'tenant_id, total_cost, customer_signature, customer_signed_at, customer_signature_method, ' +
        'work_completed_at, completion_pdf_url, completion_signer_name, completion_signed_at, ' +
        'in_route_at, arrived_at_jobsite_at, work_started_at, total_hours_worked, total_days_worked, ' +
        // Feeds the arrival estimate below.
        'jobsite_latitude, jobsite_longitude, drive_distance_miles, arrival_time'
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
      // NO `notes`: the per-item quick note is the operator's INTERNAL
      // narrative for the office (prep, access, delays, who held us up). It is
      // deliberately never exposed to the customer.
      .select('work_type, quantity, core_quantity, core_size, linear_feet_cut, created_at')
      .eq('job_order_id', jobId)
      .order('created_at', { ascending: true });

    // Fetch daily logs
    const { data: dailyLogs } = await supabaseAdmin
      .from('daily_job_logs')
      // NO `notes`: that's the operator's job-level day note ("hold-ups, who
      // you worked with") — internal to the office, not for the customer.
      .select('log_date, day_number, hours_worked, work_performed, created_at')
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

    // completion-pdfs bucket is private (security F1). The valid portal token
    // authorized this customer for this job — return a short-lived SIGNED url.
    const { signStoredUrl } = await import('@/lib/storage-url-server');
    const signedCompletionPdf = await signStoredUrl((jobRow as any).completion_pdf_url);

    // ── Estimated arrival ────────────────────────────────────────────────────
    // The crew taps In Route on day one only. After that the customer should
    // still see when to expect them, worked out from the jobsite's distance to
    // the shop. Only shown while the job is still coming — never on a job
    // that's finished, and never once the crew has actually arrived today.
    let eta: (ReturnType<typeof computeEta> & { arrives_at: string | null }) | null = null;
    try {
      const stillComing = !['completed', 'cancelled', 'archived'].includes(
        String(jobRow.status || '')
      );
      if (stillComing && !jobRow.arrived_at_jobsite_at) {
        const { data: shopRow } = await supabaseAdmin
          .from('tenants')
          .select('shop_latitude, shop_longitude, timezone')
          .eq('id', portalToken.tenant_id)
          .maybeSingle();

        const result = computeEta({
          shop: { latitude: shopRow?.shop_latitude, longitude: shopRow?.shop_longitude },
          jobsite: { latitude: jobRow.jobsite_latitude, longitude: jobRow.jobsite_longitude },
          driveDistanceMiles: jobRow.drive_distance_miles,
          // If the crew is already rolling, count from when they left;
          // otherwise this is a duration, not a clock time.
          departAt: jobRow.in_route_at ? new Date(jobRow.in_route_at) : undefined,
        });

        if (result.basis !== 'unavailable') {
          eta = { ...result, arrives_at: result.arrivesAt ? result.arrivesAt.toISOString() : null };
        }
      }
    } catch (e) {
      // An arrival estimate is a nicety — never fail the customer's job view.
      console.error('[portal] ETA calculation failed (continuing):', e);
    }

    return NextResponse.json({
      success: true,
      data: {
        job: {
          ...jobRow,
          completion_pdf_url: signedCompletionPdf,
          operator_name: operatorName,
        },
        work_items: workItems || [],
        // `work_performed` is a jsonb array built from the same objects the
        // operator submits, so each entry carries the internal quick note.
        // Strip it before it crosses this token-only public boundary.
        daily_logs: (dailyLogs || []).map((log) => ({
          ...log,
          work_performed: stripInternalNotes(log.work_performed),
        })),
        change_orders: changeOrders,
        // Estimated arrival, for the days after the crew stops tapping In Route.
        // Null when there is nothing to measure from — the customer is shown
        // nothing rather than a made-up time.
        eta,
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
