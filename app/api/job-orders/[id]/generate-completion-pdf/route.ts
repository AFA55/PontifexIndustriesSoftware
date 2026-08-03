/**
 * POST /api/job-orders/[id]/generate-completion-pdf
 *
 * Generates a professional completion sign-off PDF, uploads it to Supabase
 * Storage, and saves the URL + signer info back to the job_orders row.
 *
 * Body: {
 *   signerName: string,
 *   signatureDataUrl: string,      // base64 data URL from canvas
 *   workPerformed: WorkItem[],
 * }
 *
 * Returns: { success: true, pdf_url: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getTenantId } from '@/lib/get-tenant-id';
import { renderToBuffer } from '@react-pdf/renderer';
import React from 'react';
import CompletionSignOffPDF, { type CompletionPDFData } from '@/components/pdf/CompletionSignOffPDF';
import { toCompletionPdfWorkItems } from '@/lib/work-items-format';
import { sendEmail, getTenantEmailBranding, generateCompletionThankYouEmail } from '@/lib/email';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;

    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const {
      signerName,
      signatureDataUrl,
      workPerformed = [],
      customer_email,
      reference_photo_urls,
    } = body as {
      signerName?: string;
      signatureDataUrl?: string;
      workPerformed?: unknown[];
      customer_email?: string;
      reference_photo_urls?: string[];
    };

    const tenantId = await getTenantId(auth.userId);

    // ── Fetch job data ──────────────────────────────────────────────────────
    let jobQuery = supabaseAdmin
      .from('job_orders')
      .select('*')
      .eq('id', jobId);
    if (tenantId) jobQuery = jobQuery.eq('tenant_id', tenantId);
    const { data: job, error: jobError } = await jobQuery.single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // ── Fetch operator & helper names ───────────────────────────────────────
    // Operator attribution comes from the daily-log ledger, NOT just the
    // current assigned_to: on a reassigned multi-day job the PDF must credit
    // everyone who actually worked it ("Aiden (Day 1), Zack (Day 2)"), not
    // whoever happens to hold assigned_to at completion time. Falls back to
    // assigned_to when there are no logs. (daily_job_logs has no tenant_id
    // column — the job row above is already tenant-verified, and we scope by
    // its id.)
    let operatorName = '';
    let helperName = '';

    try {
      const { data: logRows } = await supabaseAdmin
        .from('daily_job_logs')
        .select('operator_id, log_date')
        .eq('job_order_id', jobId)
        .order('log_date', { ascending: true });

      const logs = (logRows || []).filter((l: any) => l.operator_id);
      if (logs.length > 0) {
        // Day numbers = position of the calendar date within the job's logged days.
        const distinctDates = Array.from(new Set(logs.map((l: any) => String(l.log_date)))).sort();
        const dayNumber = new Map(distinctDates.map((d, i) => [d, i + 1]));

        // Distinct operators in first-worked order, excluding the helper slot
        // (helpers log days too on crew jobs — their credit stays on the
        // helper line below).
        const operatorDays = new Map<string, number[]>();
        for (const l of logs) {
          if (l.operator_id === job.helper_assigned_to) continue;
          const days = operatorDays.get(l.operator_id) || [];
          const n = dayNumber.get(String(l.log_date))!;
          if (!days.includes(n)) days.push(n);
          operatorDays.set(l.operator_id, days);
        }

        if (operatorDays.size > 0) {
          const ids = Array.from(operatorDays.keys());
          const { data: profiles } = await supabaseAdmin
            .from('profiles')
            .select('id, full_name')
            .in('id', ids);
          const nameById = new Map((profiles || []).map((p: any) => [p.id, p.full_name || 'Operator']));
          operatorName =
            operatorDays.size === 1
              ? nameById.get(ids[0]) || ''
              : ids
                  .map((id) => {
                    const days = (operatorDays.get(id) || []).sort((a, b) => a - b);
                    return `${nameById.get(id) || 'Operator'} (Day ${days.join(', Day ')})`;
                  })
                  .join(', ');
        }
      }
    } catch (attrErr) {
      // Attribution is best-effort — fall through to assigned_to below.
      console.warn('completion PDF operator attribution failed:', attrErr);
    }

    if (!operatorName && job.assigned_to) {
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

    // ── Fetch branding (tenant-scoped; generic fallback — no hardcoded tenant) ──
    let companyName = 'Your Service Provider';
    let companyAddress = '';
    let companyPhone = '';

    try {
      let brandingQuery = supabaseAdmin
        .from('tenant_branding')
        .select('company_name, support_phone, company_address, company_city, company_state, company_zip');
      brandingQuery = tenantId
        ? brandingQuery.eq('tenant_id', tenantId)
        : brandingQuery.limit(1);
      const { data: branding } = await brandingQuery.single();
      if (branding) {
        companyName = branding.company_name || companyName;
        const addr = [branding.company_address, branding.company_city, branding.company_state, branding.company_zip]
          .filter(Boolean)
          .join(', ');
        companyAddress = addr;
        companyPhone = branding.support_phone || '';
      }
    } catch {
      // Use defaults
    }

    // ── Work items for the PDF ───────────────────────────────────────────────
    // The client posts its own `workPerformed` array, which carries the
    // operator's INTERNAL quick note. This document is signed by the customer
    // and published to the portal, so the note must never reach it — and the
    // fix belongs here, at the trust boundary, not in the caller.
    //
    // Prefer the authoritative DB rows (they also carry details_json, so the
    // description column shows real measurements instead of prose). Fall back
    // to the posted array only when the job has no saved rows (the operator's
    // offline/localStorage path), and sanitize it either way.
    const { data: savedWorkItems } = await supabaseAdmin
      .from('work_items')
      .select('work_type, quantity, core_quantity, core_size, core_depth_inches, linear_feet_cut, cut_depth_inches, details_json')
      .eq('job_order_id', jobId)
      .order('created_at', { ascending: true });

    const pdfWorkItems = toCompletionPdfWorkItems(
      savedWorkItems && savedWorkItems.length > 0 ? savedWorkItems : workPerformed
    );

    // ── Build PDF data ───────────────────────────────────────────────────────
    const signedAt = new Date().toISOString();

    const pdfData: CompletionPDFData = {
      job_number: job.job_number,
      customer_name: job.customer_name,
      address: job.address,
      location: job.location,
      scheduled_date: job.scheduled_date,
      description: job.description,
      scope_of_work: job.scope_of_work,
      operator_name: operatorName,
      helper_name: helperName,
      work_performed: pdfWorkItems,
      signer_name: signerName || undefined,
      signature_data_url: signatureDataUrl || undefined,
      signed_at: signedAt,
      company_name: companyName,
      company_address: companyAddress,
      company_phone: companyPhone,
    };

    // ── Render PDF ───────────────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(
      React.createElement(CompletionSignOffPDF, { data: pdfData }) as any
    );

    // ── Ensure completion-pdfs bucket exists ────────────────────────────────
    // Failures here MUST be surfaced — a missing bucket means the PDF can never
    // persist, so we cannot let the request return success (silent data loss).
    const { data: buckets, error: listBucketsError } = await supabaseAdmin.storage.listBuckets();
    if (listBucketsError) {
      console.error('Failed to list storage buckets:', listBucketsError);
      return NextResponse.json(
        { error: 'Failed to verify completion PDF storage', details: listBucketsError.message },
        { status: 500 }
      );
    }
    const bucketExists = buckets?.some((b) => b.name === 'completion-pdfs');
    if (!bucketExists) {
      const { error: createBucketError } = await supabaseAdmin.storage.createBucket(
        'completion-pdfs',
        { public: true }
      );
      // Ignore a "already exists" race (another concurrent request created it).
      if (createBucketError && !/already exists/i.test(createBucketError.message)) {
        console.error('Failed to create completion-pdfs bucket:', createBucketError);
        return NextResponse.json(
          { error: 'Failed to create completion PDF storage', details: createBucketError.message },
          { status: 500 }
        );
      }
    }

    // ── Upload PDF to Supabase Storage ───────────────────────────────────────
    const timestamp = Date.now();
    const pathPrefix = tenantId ? `${tenantId}/${jobId}` : jobId;
    const storagePath = `${pathPrefix}/completion-${timestamp}.pdf`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from('completion-pdfs')
      .upload(storagePath, buffer, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      console.error('PDF upload error:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload completion PDF', details: uploadError.message },
        { status: 500 }
      );
    }

    // ── Get public URL ───────────────────────────────────────────────────────
    const { data: urlData } = supabaseAdmin.storage
      .from('completion-pdfs')
      .getPublicUrl(storagePath);

    const pdfUrl = urlData?.publicUrl || '';

    // The upload succeeded but we have no resolvable URL to archive — surface it
    // rather than persisting an empty completion_pdf_url.
    if (!pdfUrl) {
      console.error('PDF uploaded but public URL could not be resolved for path:', storagePath);
      return NextResponse.json(
        { error: 'Completion PDF uploaded but its URL could not be resolved' },
        { status: 500 }
      );
    }

    // ── Update job_orders row ────────────────────────────────────────────────
    // The PDF URL is the customer-facing artifact. If this write fails the job
    // would look completed with NO archived PDF (silent data loss), so fail loud.
    const { error: updateError } = await supabaseAdmin
      .from('job_orders')
      .update({
        completion_pdf_url: pdfUrl,
        completion_signed_at: signedAt,
        completion_signer_name: signerName || null,
        completion_signature_url: signatureDataUrl || null,
      })
      .eq('id', jobId);

    if (updateError) {
      console.error('Failed to save completion PDF URL to job:', updateError);
      return NextResponse.json(
        { error: 'Completion PDF was generated but could not be saved to the job', details: updateError.message },
        { status: 500 }
      );
    }

    // ── Optional: email PDF receipt to customer (fire-and-forget) ──────────
    const customerEmailTrimmed = (customer_email || '').trim();
    if (customerEmailTrimmed) {
      try {
        const referencePhotos = Array.isArray(reference_photo_urls) ? reference_photo_urls : [];
        const branding = await getTenantEmailBranding(tenantId);
        const html = await generateCompletionThankYouEmail({
          variant: 'completion',
          branding,
          companyPhone,
          jobNumber: job.job_number,
          customerName: job.customer_name,
          location: job.address || job.location,
          scopeOfWork: job.scope_of_work || job.description,
          operatorName,
          referencePhotos,
        });
        // base64-encode the PDF buffer for Resend's attachment payload
        const pdfBase64 = Buffer.from(buffer).toString('base64');
        await sendEmail({
          to: customerEmailTrimmed,
          subject: `Thank you from ${companyName} — Job ${job.job_number} Sign-Off`,
          html,
          attachments: [
            {
              filename: `Job-${job.job_number}-SignOff.pdf`,
              content: pdfBase64,
              contentType: 'application/pdf',
            },
          ],
        });
      } catch (emailErr) {
        console.error('Customer thank-you email failed (non-fatal):', emailErr);
      }
    }

    // completion-pdfs is private (security F1): the stored URL is a /public/
    // path (kept as a path carrier — resolvers re-sign it), but the URL we hand
    // back for the operator's immediate "view PDF" must be signed to load.
    const { signStoredUrl } = await import('@/lib/storage-url-server');
    const signedForView = await signStoredUrl(pdfUrl);
    return NextResponse.json({ success: true, pdf_url: signedForView });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error generating completion PDF:', error);
    return NextResponse.json(
      { error: 'Failed to generate completion PDF', details: msg },
      { status: 500 }
    );
  }
}

