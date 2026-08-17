/**
 * API Route: GET /api/job-orders/[id]/dispatch-pdf
 * Generate a printable dispatch ticket PDF for a job order
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';
import { renderToBuffer } from '@react-pdf/renderer';
import React from 'react';
import DispatchTicketPDF from '@/components/pdf/DispatchTicketPDF';
import { getTenantPdfBranding, type PDFBranding } from '@/lib/pdf-branding';
import { collectTicketPhotos } from '@/lib/job-ticket-photos';
import { resolveTicketPhotos } from '@/lib/job-ticket-photos-server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;

    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    // Verify role (admins, operators, and salesmen can print dispatch tickets)
    const allowedRoles = ['admin', 'super_admin', 'operations_manager', 'salesman', 'operator'];
    if (!auth.role || !allowedRoles.includes(auth.role)) {
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

    // Fetch operator and helper names
    let operatorName = '';
    let helperName = '';

    if (job.assigned_to) {
      const { data: opProfile } = await supabaseAdmin
        .from('profiles')
        .select('full_name')
        .eq('id', job.assigned_to)
        .single();
      operatorName = opProfile?.full_name || '';
    }

    if (job.helper_assigned_to) {
      const { data: helpProfile } = await supabaseAdmin
        .from('profiles')
        .select('full_name')
        .eq('id', job.helper_assigned_to)
        .single();
      helperName = helpProfile?.full_name || '';
    }

    // ── QUOTED BY ──────────────────────────────────────────────────────────
    // Founder, Aug 16: "it has submitted by blank but when I go to schedule
    // form it shows Andres Altamirano."
    //
    // The ticket prints `salesman_name`, which is NULL on 9 of the 46 job
    // orders in production. Only the CREATE path ever sets it (POST
    // /api/admin/schedule-form maps body.submitted_by → salesman_name); the
    // edit PATCH never sends it, and until now `salesman_name` was not even in
    // that route's allowedFields, so no edit could ever fill one in. Meanwhile
    // the schedule form's "Submitted By" box auto-fills with the CURRENT user's
    // name on mount — which is exactly why the form looked populated while the
    // column was null.
    //
    // Patching the write path alone leaves every existing job blank forever, so
    // the ticket falls back to the profile behind `created_by` — the person who
    // actually filled the form. 8 of those 9 null rows resolve that way; the
    // 9th has no created_by either (a seeded demo row) and prints '—'.
    let quotedBy: string = job.salesman_name || '';
    if (!quotedBy && job.created_by) {
      const { data: creator } = await supabaseAdmin
        .from('profiles')
        .select('full_name')
        .eq('id', job.created_by)
        .maybeSingle();
      quotedBy = creator?.full_name || '';
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
      salesman_name: quotedBy,
      operator_name: operatorName,
      helper_name: helperName,
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
