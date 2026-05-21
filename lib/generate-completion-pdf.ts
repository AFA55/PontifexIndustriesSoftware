/**
 * lib/generate-completion-pdf.ts
 *
 * Shared helper that generates a completion sign-off PDF and uploads it to the
 * `completion-pdfs` Supabase Storage bucket.  Returns the public URL.
 *
 * Called by:
 *   - POST /api/job-orders/[id]/generate-completion-pdf  (authenticated, in-person sign)
 *   - POST /api/public/signature/[token]                 (public, remote sign)
 */

import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { supabaseAdmin } from '@/lib/supabase-admin';
import CompletionSignOffPDF, { type CompletionPDFData } from '@/components/pdf/CompletionSignOffPDF';

export interface GenerateCompletionPdfOptions {
  jobId: string;
  tenantId: string | null;
  /** Already-fetched job row (full or partial). */
  job: {
    job_number: string;
    customer_name: string;
    address?: string | null;
    location?: string | null;
    scheduled_date?: string | null;
    description?: string | null;
    scope_of_work?: string | null;
    assigned_to?: string | null;
    helper_assigned_to?: string | null;
  };
  signerName?: string | null;
  /** base64 data-URL of the signature canvas, or undefined if not captured. */
  signatureDataUrl?: string | null;
  /** Work items already fetched from DB (or passed from request body). */
  workPerformed?: unknown[];
}

export interface GenerateCompletionPdfResult {
  pdfUrl: string;
  storagePath: string;
}

/**
 * Generate + upload the completion PDF.  Returns the public bucket URL.
 * Throws on hard failures (render / upload); callers should wrap in try/catch
 * or use fire-and-forget if non-blocking is preferred.
 */
export async function generateAndUploadCompletionPdf(
  opts: GenerateCompletionPdfOptions
): Promise<GenerateCompletionPdfResult> {
  const { jobId, tenantId, job, signerName, signatureDataUrl, workPerformed = [] } = opts;

  // ── Fetch operator & helper names ──────────────────────────────────────────
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

  // ── Fetch tenant branding ──────────────────────────────────────────────────
  let companyName = 'Patriot Concrete Cutting';
  let companyAddress = '';
  let companyPhone = '';

  try {
    let brandingQuery = supabaseAdmin
      .from('tenant_branding')
      .select('company_name, support_phone, company_address, company_city, company_state, company_zip');
    if (tenantId) brandingQuery = brandingQuery.eq('tenant_id', tenantId);
    const { data: branding } = await brandingQuery.limit(1).single();
    if (branding) {
      companyName = branding.company_name || companyName;
      const addr = [
        branding.company_address,
        branding.company_city,
        branding.company_state,
        branding.company_zip,
      ]
        .filter(Boolean)
        .join(', ');
      companyAddress = addr;
      companyPhone = branding.support_phone || '';
    }
  } catch {
    // Use defaults
  }

  // ── Build PDF data ─────────────────────────────────────────────────────────
  const signedAt = new Date().toISOString();

  const pdfData: CompletionPDFData = {
    job_number: job.job_number,
    customer_name: job.customer_name,
    address: job.address ?? undefined,
    location: job.location ?? undefined,
    scheduled_date: job.scheduled_date ?? undefined,
    description: job.description ?? undefined,
    scope_of_work: job.scope_of_work ?? undefined,
    operator_name: operatorName,
    helper_name: helperName,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    work_performed: workPerformed as any,
    signer_name: signerName || undefined,
    signature_data_url: signatureDataUrl || undefined,
    signed_at: signedAt,
    company_name: companyName,
    company_address: companyAddress,
    company_phone: companyPhone,
  };

  // ── Render PDF ─────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(
    React.createElement(CompletionSignOffPDF, { data: pdfData }) as any
  );

  // ── Ensure bucket exists ───────────────────────────────────────────────────
  const { data: buckets } = await supabaseAdmin.storage.listBuckets();
  const bucketExists = buckets?.some((b) => b.name === 'completion-pdfs');
  if (!bucketExists) {
    await supabaseAdmin.storage.createBucket('completion-pdfs', { public: true });
  }

  // ── Upload ─────────────────────────────────────────────────────────────────
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
    throw new Error(`PDF upload failed: ${uploadError.message}`);
  }

  // ── Public URL ─────────────────────────────────────────────────────────────
  const { data: urlData } = supabaseAdmin.storage
    .from('completion-pdfs')
    .getPublicUrl(storagePath);

  const pdfUrl = urlData?.publicUrl || '';

  return { pdfUrl, storagePath };
}
