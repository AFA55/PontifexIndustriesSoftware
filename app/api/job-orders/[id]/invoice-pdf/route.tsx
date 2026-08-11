export const dynamic = 'force-dynamic';

/**
 * GET /api/job-orders/[id]/invoice-pdf
 *
 * Drafts Patriot's INVOICE/BILLING sheet for a job (management batch M2f).
 * Today the office pulls the completion ticket and the work ticket and retypes
 * both into a separate sheet by hand; this fills in everything the platform
 * already knows and leaves the money for them to write, as they do now.
 *
 * ── The two PLURAL fields, which are the whole point ────────────────────────
 * DATE(S) WORK PERFORMED and Job Ticket #(S) are plural on the paper form
 * because of how Patriot actually works (founder, Aug 10): several operators can
 * be on one job — some for a day, some half a day to help someone finish — and
 * each gets their OWN ticket to record work, all belonging to ONE job. So this
 * route resolves the whole FAMILY of tickets (root + every `parent_job_id`
 * child) and gathers dates and work across all of them. Reading only the job in
 * the URL would silently bill for one crew's work.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, ADMIN_ROLES } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';
import { renderToBuffer } from '@react-pdf/renderer';
import React from 'react';
import InvoiceBillingPDF, { type InvoiceBillingData } from '@/components/pdf/InvoiceBillingPDF';
import { buildWorkPerformedSummary } from '@/lib/work-items-format';
import { formatDay } from '@/lib/dates';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;

    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    // Billing is office work — not the crew's.
    if (!auth.role || !ADMIN_ROLES.includes(auth.role as typeof ADMIN_ROLES[number])) {
      return NextResponse.json({ error: 'Not authorized to draft invoices' }, { status: 403 });
    }

    const tenantId = await getTenantId(auth.userId);

    let jobQuery = supabaseAdmin
      .from('job_orders')
      .select('*')
      .eq('id', jobId);
    if (tenantId) jobQuery = jobQuery.eq('tenant_id', tenantId);
    const { data: job } = await jobQuery.maybeSingle();

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // ── The whole ticket family ─────────────────────────────────────────────
    // A duplicate points at its root via parent_job_id. Whichever ticket the
    // office opened, bill the JOB.
    const rootId: string = job.parent_job_id || job.id;
    let familyQuery = supabaseAdmin
      .from('job_orders')
      .select('id, job_number')
      .or(`id.eq.${rootId},parent_job_id.eq.${rootId}`);
    if (tenantId) familyQuery = familyQuery.eq('tenant_id', tenantId);
    const { data: familyRows } = await familyQuery;

    const family = familyRows?.length ? familyRows : [{ id: job.id, job_number: job.job_number }];
    const familyIds = family.map((f: { id: string }) => f.id);

    // Every distinct day anyone worked, across every crew's ticket.
    const { data: logs } = await supabaseAdmin
      .from('daily_job_logs')
      .select('log_date')
      .in('job_order_id', familyIds)
      .order('log_date');

    const datesWorked = [...new Set((logs ?? []).map((l: { log_date: string }) => l.log_date).filter(Boolean))]
      .map((d) => formatDay(d as string));

    // Work performed across the whole family, summarised the same way the
    // customer's ticket and the portal already do it.
    const { data: workItems } = await supabaseAdmin
      .from('work_items')
      .select('work_type, quantity, core_quantity, core_size, core_depth_inches, linear_feet_cut, cut_depth_inches, notes, details_json, day_number')
      .in('job_order_id', familyIds)
      .order('day_number', { ascending: true });

    const summary = buildWorkPerformedSummary(workItems || []) || job.work_performed || '';
    // buildWorkPerformedSummary returns one string with days separated by ' | '
    // ("Day 1: … | Day 2: …"). Split on the DAY boundary so each day lands on
    // its own ruled line — joined, it overflowed the first line and printed
    // straight through the rule underneath it.
    const descriptionLines = String(summary)
      .split(/\s*\|\s*|\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const { data: changeOrders } = await supabaseAdmin
      .from('change_orders')
      .select('co_number')
      .in('job_order_id', familyIds);

    // Branding — white-label, never hardcode Patriot.
    let companyLogoUrl: string | null = null;
    let companyName: string | null = null;
    if (job.tenant_id) {
      const { data: branding } = await supabaseAdmin
        .from('tenant_branding')
        .select('company_name, logo_url')
        .eq('tenant_id', job.tenant_id)
        .maybeSingle();
      companyLogoUrl = branding?.logo_url ?? null;
      companyName = branding?.company_name ?? null;
    }

    const addressLines = String(job.address || job.location || '')
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);

    const data: InvoiceBillingData = {
      companyLogoUrl,
      companyName,
      customerLines: [job.customer_name, job.customer_contact].filter(Boolean) as string[],
      // A contract number, and "most don't" have one (founder, Aug 11) — the
      // line still prints so the sheet matches the paper original.
      subcontract: null,
      changeOrderNumbers: (changeOrders ?? [])
        .map((c: { co_number: string | null }) => c.co_number)
        .filter(Boolean) as string[],
      poNumber: job.po_number ?? null,
      jobNumber: job.job_number ?? null,
      salesRep: job.salesman_name ?? null,
      // Founder's rule: the project name when the job has one, otherwise the
      // address. 17 of 30 live jobs carry a project_name.
      jobName: job.project_name || job.address || job.location || null,
      jobLocationLines: addressLines,
      datesWorked,
      jobTicketNumbers: family
        .map((f: { job_number: string | null }) => f.job_number)
        .filter(Boolean) as string[],
      descriptionLines,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(
      React.createElement(InvoiceBillingPDF, { data }) as any
    );

    return new NextResponse(buffer as any, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="invoice-${job.job_number || job.id}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: any) {
    console.error('Error generating invoice PDF:', error);
    return NextResponse.json(
      { error: 'Failed to draft the invoice sheet', details: error?.message },
      { status: 500 }
    );
  }
}
