export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/jobs/[id]/waiver-pdf
 *
 * Renders the signed utility-damage waiver as a PDF, on demand, from the
 * signature we already hold on the job.
 *
 * FOUNDER (Aug 12): "I would like to see the PDFs of the signed waivers… I
 * haven't seen any of that yet."
 *
 * He hadn't, because none were ever made. The waiver flow captures
 * `utility_waiver_signature_data` and flips `utility_waiver_signed`, and that is
 * where it stopped — `/api/liability-release/pdf` renders this document but is
 * only reachable from a debug component, so no job has ever produced one.
 *
 * ON DEMAND, NOT BACKFILLED. Everything needed is already on the job row, so
 * rendering at request time makes every past signature viewable the moment this
 * ships, with nothing to migrate and no second copy to drift. It also means a
 * corrected signature is always reflected, which an archived file would not be.
 *
 * Streams `application/pdf` inline so the browser previews it rather than
 * downloading a file the office then has to find again.
 */

import React from 'react';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';
import { renderToBuffer } from '@react-pdf/renderer';
import { LiabilityReleasePDF } from '@/components/pdf/LiabilityReleasePDF';
import { getTenantEmailBranding } from '@/lib/email';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId } = await context.params;
    const tenantId = auth.tenantId;
    const kind = new URL(request.url).searchParams.get('kind');

    let q = supabaseAdmin
      .from('job_orders')
      .select(
        `id, job_number, tenant_id, customer_name, customer_email, customer_contact,
         address, location, assigned_to,
         utility_waiver_signed, utility_waiver_signed_at, utility_waiver_signer_name,
         utility_waiver_signature_data,
         liability_release_signature, liability_release_signed_at`
      )
      .eq('id', jobId);
    if (tenantId) q = q.eq('tenant_id', tenantId);
    const { data: job, error } = await q.maybeSingle();

    if (error || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const isLiability = kind === 'liability';
    const signature = (isLiability
      ? job.liability_release_signature
      : job.utility_waiver_signature_data) as string | null;
    const signedAt = (isLiability
      ? job.liability_release_signed_at
      : job.utility_waiver_signed_at) as string | null;

    // No signature means there is no document — say so plainly rather than
    // handing back a blank page that looks like a signed record.
    if (!signature) {
      return NextResponse.json(
        { error: 'This job has no signed waiver to render.' },
        { status: 404 }
      );
    }

    // Operator name, for the "released by" line. Best-effort: a missing name
    // must not stop a signed legal document from rendering.
    let operatorName = '';
    if (job.assigned_to) {
      const { data: prof } = await supabaseAdmin
        .from('profiles')
        .select('full_name')
        .eq('id', job.assigned_to as string)
        .maybeSingle();
      operatorName = prof?.full_name ?? '';
    }

    const branding = await getTenantEmailBranding((job.tenant_id as string) ?? tenantId ?? null);

    const buffer = await renderToBuffer(
      React.createElement(LiabilityReleasePDF, {
        customerName:
          (job.utility_waiver_signer_name as string) ||
          (job.customer_contact as string) ||
          (job.customer_name as string) ||
          'Customer',
        customerEmail: (job.customer_email as string) || '',
        operatorName,
        signatureDataURL: signature,
        jobNumber: (job.job_number as string) || '',
        jobAddress: (job.address as string) || (job.location as string) || '',
        signedAt: signedAt || '',
        branding: {
          company_name: branding?.companyName,
          logo_url: branding?.logoUrl ?? null,
          primary_color: branding?.brandColor,
        },
      }) as any
    );

    const label = isLiability ? 'liability-release' : 'utility-waiver';
    return new NextResponse(buffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${label}-${job.job_number}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e: any) {
    console.error('[waiver-pdf] render failed', e);
    return NextResponse.json({ error: 'Failed to render the waiver PDF' }, { status: 500 });
  }
}
