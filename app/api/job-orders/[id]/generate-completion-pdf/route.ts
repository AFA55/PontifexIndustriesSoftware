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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;

    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const { signerName, signatureDataUrl, workPerformed = [] } = body;

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

    // ── Fetch branding ───────────────────────────────────────────────────────
    let companyName = 'Patriot Concrete Cutting';
    let companyAddress = '';
    let companyPhone = '';

    try {
      const { data: branding } = await supabaseAdmin
        .from('tenant_branding')
        .select('company_name, support_phone, company_address, company_city, company_state, company_zip')
        .limit(1)
        .single();
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
      work_performed: workPerformed,
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
    // (If bucket doesn't exist, upload will create it as private; we try public first)
    const { data: buckets } = await supabaseAdmin.storage.listBuckets();
    const bucketExists = buckets?.some((b) => b.name === 'completion-pdfs');
    if (!bucketExists) {
      await supabaseAdmin.storage.createBucket('completion-pdfs', { public: true });
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

    // ── Update job_orders row ────────────────────────────────────────────────
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
      console.error('Failed to update job with PDF URL:', updateError);
      // Don't fail the whole request — PDF was generated and uploaded
    }

    return NextResponse.json({ success: true, pdf_url: pdfUrl });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error generating completion PDF:', error);
    return NextResponse.json(
      { error: 'Failed to generate completion PDF', details: msg },
      { status: 500 }
    );
  }
}
