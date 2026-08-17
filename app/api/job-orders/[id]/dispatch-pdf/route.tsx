/**
 * API Route: GET /api/job-orders/[id]/dispatch-pdf
 * Generate a printable dispatch ticket PDF for a job order
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, DISPATCH_TICKET_ROLES } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';
import { renderToBuffer } from '@react-pdf/renderer';
import React from 'react';
import DispatchTicketPDF from '@/components/pdf/DispatchTicketPDF';
import { getTenantPdfBranding, type PDFBranding } from '@/lib/pdf-branding';
import { collectTicketPhotos } from '@/lib/job-ticket-photos';
import { resolveTicketPhotos } from '@/lib/job-ticket-photos-server';
import { resolveQuotedBy } from '@/lib/job-ticket-quoted-by';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;

    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    // WHO MAY PRINT A DISPATCH TICKET.
    //
    // This was a hand-rolled array, and hand-rolled arrays drift: it omitted
    // `supervisor`, so David Schadt could open the schedule board, see the job,
    // press Print Ticket and get a 403 — while a salesman standing next to him
    // could print the same sheet. Now it is the shared constant, so this route
    // can never fall out of step with the other print surfaces again.
    //
    // `operator` stays: the crew prints its own ticket from /dashboard/my-jobs.
    if (!auth.role || !DISPATCH_TICKET_ROLES.includes(auth.role)) {
      return NextResponse.json({ error: 'Not authorized to print dispatch tickets' }, { status: 403 });
    }

    // Tenant filtering
    const tenantId = await getTenantId(auth.userId);

    // Fetch full job data
    let jobQuery = supabaseAdmin
      .from('job_orders')
      .select('*')
      .eq('id', jobId);
    if (tenantId) jobQuery = jobQuery.eq('tenant_id', tenantId);
    const { data: job, error: jobError } = await jobQuery.single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    /** One profile name. `.maybeSingle()`, so a deleted profile is '' not a 500. */
    const lookupFullName = async (profileId: string): Promise<string | null> => {
      const { data } = await supabaseAdmin
        .from('profiles')
        .select('full_name')
        .eq('id', profileId)
        .maybeSingle();
      return data?.full_name ?? null;
    };

    // Fetch operator and helper names. NOT printed on the sheet (crew names were
    // removed from both tickets — a sheet printed Monday must not assert who is
    // on the job Thursday), but still carried on the data object.
    const operatorName = job.assigned_to ? (await lookupFullName(job.assigned_to)) || '' : '';
    const helperName = job.helper_assigned_to
      ? (await lookupFullName(job.helper_assigned_to)) || ''
      : '';

    // ── QUOTED BY ──────────────────────────────────────────────────────────
    // The salesman_name-or-created_by fallback now lives in
    // lib/job-ticket-quoted-by.ts, because the HTML printed ticket renders this
    // same field and two copies of the rule is how the two sheets start
    // disagreeing about who quoted a job. See that file for the full history.
    const quotedBy = await resolveQuotedBy(job.salesman_name, job.created_by, lookupFullName);

    // ── SERVICE ITEMS ──────────────────────────────────────────────────────
    // `job_scope_items` — the measured targets the office set per service. The
    // HTML ticket has always printed these; this one never fetched them, which
    // is one of the two documents' biggest content differences.
    let scopeItemsQuery = supabaseAdmin
      .from('job_scope_items')
      .select('id, work_type, description, unit, target_quantity, sort_order')
      .eq('job_order_id', jobId);
    if (tenantId) scopeItemsQuery = scopeItemsQuery.eq('tenant_id', tenantId);
    const { data: scopeItemRows } = await scopeItemsQuery.order('sort_order', { ascending: true });

    // ── PROJECT MANAGER ────────────────────────────────────────────────────
    // On the HTML ticket's SCHEDULE block. Same office owner, same sheet.
    let projectManagerName = '';
    if (job.project_manager_id) {
      projectManagerName = (await lookupFullName(job.project_manager_id)) || '';
    }

    // ── PHOTOS (page 2 onward) ─────────────────────────────────────────────
    // Bytes are pulled out of Storage with the service-role client and inlined
    // BEFORE render. Two reasons, both verified against production: the stored
    // `/object/public/job-photos/...` URLs 400 ("Bucket not found") because
    // both photo buckets are private, and a remote URL inside renderToBuffer
    // stalls or throws — either way a decorative photo would have cost the crew
    // the whole ticket. A photo that cannot be resolved is simply not printed.
    let photos: { dataUri: string; caption: string }[] = [];
    try {
      photos = await resolveTicketPhotos(collectTicketPhotos(job));
    } catch (photoError) {
      console.error('dispatch-pdf: photo resolution failed, printing ticket without them', photoError);
    }

    // Fetch branding for PDF — tenant-scoped (was unscoped: any tenant's row).
    // A null-tenant super_admin brands with the JOB's tenant, not neutral.
    const tenantBranding = await getTenantPdfBranding(tenantId ?? job.tenant_id ?? null);
    const pdfBranding: PDFBranding = {
      ...tenantBranding,
      // Dispatch ticket shows the phone with an explicit label
      company_phone: tenantBranding.company_phone
        ? `Phone: ${tenantBranding.company_phone}`
        : undefined,
    };

    // Build the PDF data
    const pdfData = {
      job_number: job.job_number,
      title: job.title,
      customer_name: job.customer_name,
      customer_contact: job.customer_contact,
      site_contact_phone: job.site_contact_phone || job.foreman_phone,
      foreman_phone: job.foreman_phone,
      address: job.address,
      location: job.location,
      job_type: job.job_type,
      description: job.description,
      scheduled_date: job.scheduled_date,
      end_date: job.end_date,
      arrival_time: job.arrival_time,
      estimated_cost: job.estimated_cost ? Number(job.estimated_cost) : undefined,
      estimated_hours: job.estimated_hours ? Number(job.estimated_hours) : undefined,
      po_number: job.po_number,
      // The DERIVED value gets its own name; the raw column keeps its own. See
      // the note on `salesman_name` in /api/admin/jobs/[id]/summary — a derived
      // guess emitted under a writable column's name is how it gets persisted
      // as fact. Nothing PATCHes `quoted_by`.
      quoted_by: quotedBy,
      salesman_name: job.salesman_name ?? undefined,
      operator_name: operatorName,
      helper_name: helperName,
      // ── Fields the HTML ticket shows and this one did not ────────────────
      // The two sheets are now the same document rendered twice, so anything
      // one of them prints has to reach the other.
      is_will_call: job.is_will_call ?? false,
      project_name: job.project_name || undefined,
      project_manager_name: projectManagerName || undefined,
      permit_number: Array.isArray(job.permits) ? job.permits[0]?.number ?? undefined : undefined,
      additional_safety_requirements: Array.isArray(job.additional_safety_requirements)
        ? job.additional_safety_requirements
        : [],
      scope_items: Array.isArray(scopeItemRows) ? scopeItemRows : [],
      equipment_needed: job.equipment_needed || [],
      // The per-service picks — core bits, saws, hoses, pump can. The row is
      // fetched with `select('*')` so this was always present in `job`; it just
      // was never forwarded, so the dispatch ticket printed the three free-text
      // items the office typed and dropped the ~16 actually selected.
      equipment_selections: job.equipment_selections || {},
      equipment_rentals: job.equipment_rentals || [],
      equipment_rental_flags: job.equipment_rental_flags || {},
      ppe_required: job.ppe_required || [],
      scope_details: job.scope_details || {},
      site_compliance: job.site_compliance || {},
      jobsite_conditions: job.jobsite_conditions || {},
      additional_info: job.additional_info,
      job_difficulty_rating: job.job_difficulty_rating ? Number(job.job_difficulty_rating) : undefined,
      difficulty_rating: job.difficulty_rating ? Number(job.difficulty_rating) : undefined,
      permit_required: job.permit_required || false,
      permits: job.permits || [],
      is_multi_day: job.is_multi_day || false,
      total_days_worked: job.total_days_worked || 0,
      scheduling_flexibility: job.scheduling_flexibility || {},
      photos,
    };

    // THE TICKET MATTERS MORE THAN THE PHOTOS.
    //
    // The try/catch above only covers RESOLVING photos. The render was outside
    // it, so a photo that resolves but cannot be DECODED took the whole ticket
    // down with a 500 — the crew gets no sheet at all because of a decorative
    // image. The magic-byte sniff proves a JPEG/PNG header, not a file react-pdf
    // can draw: a CMYK JPEG, a truncated upload, or a 16-bit/interlaced PNG all
    // pass the sniff and throw at render time.
    //
    // So: try with photos, and on any failure print the ticket without them.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const render = (data: any) =>
      renderToBuffer(
        React.createElement(DispatchTicketPDF, { job: data, branding: pdfBranding }) as any
      );

    let buffer: Awaited<ReturnType<typeof render>>;
    try {
      buffer = await render(pdfData);
    } catch (renderError) {
      console.error(
        'dispatch-pdf: render failed with photos, retrying without them',
        renderError
      );
      buffer = await render({ ...pdfData, photos: [] });
    }

    // Return PDF response
    const uint8 = new Uint8Array(buffer);
    return new NextResponse(uint8, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="dispatch-${job.job_number}.pdf"`,
      },
    });
  } catch (error: any) {
    console.error('Error generating dispatch PDF:', error);
    return NextResponse.json(
      { error: 'Failed to generate dispatch ticket PDF', details: error.message },
      { status: 500 }
    );
  }
}
