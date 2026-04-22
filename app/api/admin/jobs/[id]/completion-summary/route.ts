export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/jobs/[id]/completion-summary
 * Returns all data needed for the completion summary page:
 * job details, work_items, daily_logs, timecards, invoices,
 * billing_milestones, and calculated scope_completion percentages.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId } = await context.params;

    // Tenant scoping: super_admin may pass ?tenantId= to override; everyone
    // else is locked to their own tenant. Mirrors the pattern in /summary.
    const overrideTenantId = request.nextUrl.searchParams.get('tenantId');
    const tenantId = auth.tenantId ?? (auth.role === 'super_admin' ? overrideTenantId : null);
    if (!tenantId) {
      return NextResponse.json(
        { error: 'Tenant scope required. super_admin must pass ?tenantId=' },
        { status: 400 }
      );
    }

    // ── 1. Fetch the job ────────────────────────────────────────────────────
    let jobQuery = supabaseAdmin
      .from('job_orders')
      .select(`
        id,
        job_number,
        project_name,
        status,
        customer_id,
        estimated_cost,
        actual_cost,
        expected_scope,
        billing_type,
        customer_rating,
        customer_feedback,
        completed_at,
        salesperson_id
      `)
      .eq('id', jobId);

    if (tenantId) jobQuery = jobQuery.eq('tenant_id', tenantId);

    const { data: job, error: jobError } = await jobQuery.single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // ── 2. Fetch work_items ─────────────────────────────────────────────────
    let workItemsQuery = supabaseAdmin
      .from('work_items')
      .select('*')
      .eq('job_order_id', jobId);
    if (tenantId) workItemsQuery = workItemsQuery.eq('tenant_id', tenantId);
    const { data: workItems } = await workItemsQuery.order('day_number', { ascending: true });

    // ── 3. Fetch daily_job_logs ─────────────────────────────────────────────
    let logsQuery = supabaseAdmin
      .from('daily_job_logs')
      .select('*')
      .eq('job_order_id', jobId);
    if (tenantId) logsQuery = logsQuery.eq('tenant_id', tenantId);
    const { data: dailyLogs } = await logsQuery.order('log_date', { ascending: true });

    // ── 4. Fetch timecards with operator names ──────────────────────────────
    let timecardsQuery = supabaseAdmin
      .from('timecards')
      .select(`
        *,
        profiles!timecards_user_id_fkey(full_name, email)
      `)
      .eq('job_order_id', jobId);
    if (tenantId) timecardsQuery = timecardsQuery.eq('tenant_id', tenantId);
    const { data: timecards } = await timecardsQuery.order('work_date', { ascending: true });

    // ── 5. Fetch invoices ───────────────────────────────────────────────────
    let invoicesQuery = supabaseAdmin
      .from('invoices')
      .select('*')
      .eq('job_order_id', jobId);
    // invoices may not have job_order_id directly — try via line items if none found
    const { data: directInvoices } = await invoicesQuery;

    let invoices = directInvoices || [];
    if (invoices.length === 0) {
      // fallback: look up via invoice_line_items
      const { data: lineItems } = await supabaseAdmin
        .from('invoice_line_items')
        .select('invoice_id')
        .eq('job_order_id', jobId);

      if (lineItems && lineItems.length > 0) {
        const invoiceIds = [...new Set(lineItems.map((li) => li.invoice_id))];
        let fallbackQuery = supabaseAdmin
          .from('invoices')
          .select('*')
          .in('id', invoiceIds);
        if (tenantId) fallbackQuery = fallbackQuery.eq('tenant_id', tenantId);
        const { data: fallbackInvoices } = await fallbackQuery;
        invoices = fallbackInvoices || [];
      }
    }

    // ── 6. Fetch billing_milestones ─────────────────────────────────────────
    let milestonesQuery = supabaseAdmin
      .from('billing_milestones')
      .select('*')
      .eq('job_order_id', jobId);
    if (tenantId) milestonesQuery = milestonesQuery.eq('tenant_id', tenantId);
    const { data: billingMilestones } = await milestonesQuery.order('milestone_percent', { ascending: true });

    // ── 7. Calculate scope_completion ───────────────────────────────────────
    const items = workItems || [];

    const actualCores = items.reduce((sum, i) => sum + Number(i.core_quantity || 0), 0);
    const actualLinearFeet = items.reduce((sum, i) => sum + Number(i.linear_feet_cut || 0), 0);

    const expectedScope = (job.expected_scope as Record<string, unknown>) || {};
    const expectedCores = Number(expectedScope.cores || 0);
    const expectedLinearFeet = Number(expectedScope.linear_feet || 0);

    const pct = (actual: number, expected: number) =>
      expected > 0 ? Math.min(100, Math.round((actual / expected) * 1000) / 10) : 0;

    const scopeCompletion = {
      cores: {
        expected: expectedCores,
        actual: actualCores,
        percent: pct(actualCores, expectedCores),
      },
      linear_feet: {
        expected: expectedLinearFeet,
        actual: actualLinearFeet,
        percent: pct(actualLinearFeet, expectedLinearFeet),
      },
    };

    return NextResponse.json({
      success: true,
      data: {
        job,
        work_items: workItems || [],
        daily_logs: dailyLogs || [],
        timecards: timecards || [],
        invoices,
        billing_milestones: billingMilestones || [],
        scope_completion: scopeCompletion,
      },
    });
  } catch (error: unknown) {
    console.error('Error in GET /completion-summary:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
