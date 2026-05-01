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
import { sendEmail } from '@/lib/email';

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      work_performed: workPerformed as any,
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

    // ── Optional: email PDF receipt to customer (fire-and-forget) ──────────
    const customerEmailTrimmed = (customer_email || '').trim();
    if (customerEmailTrimmed) {
      try {
        const referencePhotos = Array.isArray(reference_photo_urls) ? reference_photo_urls : [];
        const html = buildThankYouEmailHtml({
          companyName,
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

// ──────────────────────────────────────────────────────────────────────────────
// Branded thank-you email body (used when the operator provides a customer email
// at sign-off time). Fire-and-forget — we never block the API response on it.
// ──────────────────────────────────────────────────────────────────────────────
function buildThankYouEmailHtml(args: {
  companyName: string;
  companyPhone: string;
  jobNumber: string;
  customerName?: string | null;
  location?: string | null;
  scopeOfWork?: string | null;
  operatorName?: string | null;
  referencePhotos: string[];
}): string {
  const {
    companyName,
    companyPhone,
    jobNumber,
    customerName,
    location,
    scopeOfWork,
    operatorName,
    referencePhotos,
  } = args;

  const escape = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const photoCells = (referencePhotos || [])
    .slice(0, 6)
    .map(
      (url) =>
        `<td style="padding:4px;width:33.33%;"><img src="${escape(url)}" alt="Job photo" style="display:block;width:100%;height:auto;border-radius:8px;border:1px solid #e2e8f0;"/></td>`
    )
    .join('');

  // Pack into rows of 3
  const photoRows: string[] = [];
  if (photoCells) {
    const cells = (referencePhotos || [])
      .slice(0, 6)
      .map(
        (url) =>
          `<td style="padding:4px;width:33.33%;vertical-align:top;"><img src="${escape(url)}" alt="Job photo" style="display:block;width:100%;height:auto;border-radius:8px;border:1px solid #e2e8f0;"/></td>`
      );
    for (let i = 0; i < cells.length; i += 3) {
      photoRows.push(`<tr>${cells.slice(i, i + 3).join('')}</tr>`);
    }
  }

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Thank you from ${escape(companyName)}</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background-color:#f8fafc;color:#1e293b;">
  <table role="presentation" style="width:100%;border-collapse:collapse;background-color:#f8fafc;">
    <tr>
      <td style="padding:40px 20px;">
        <table role="presentation" style="max-width:640px;margin:0 auto;background-color:#ffffff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.08);overflow:hidden;">
          <tr>
            <td style="background:linear-gradient(135deg,#7c3aed 0%,#4f46e5 100%);padding:36px 32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.4px;">Thank you for choosing ${escape(companyName)}</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.9);font-size:14px;">Your job is complete — sign-off attached.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              ${customerName ? `<p style="margin:0 0 20px;color:#475569;font-size:16px;line-height:1.6;">Hi <strong style="color:#0f172a;">${escape(customerName)}</strong>,</p>` : ''}
              <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.6;">
                Thank you for trusting us with your concrete cutting work. We&rsquo;ve attached a PDF copy of your signed completion record for your files.
              </p>

              <table style="width:100%;border-collapse:collapse;background-color:#f8fafc;border-radius:8px;margin:0 0 24px;">
                <tr><td style="padding:14px 18px;color:#64748b;font-size:13px;border-bottom:1px solid #e2e8f0;">Job #</td><td style="padding:14px 18px;color:#0f172a;font-size:14px;font-weight:600;text-align:right;border-bottom:1px solid #e2e8f0;">${escape(jobNumber)}</td></tr>
                ${location ? `<tr><td style="padding:14px 18px;color:#64748b;font-size:13px;border-bottom:1px solid #e2e8f0;">Location</td><td style="padding:14px 18px;color:#0f172a;font-size:14px;font-weight:600;text-align:right;border-bottom:1px solid #e2e8f0;">${escape(location)}</td></tr>` : ''}
                ${operatorName ? `<tr><td style="padding:14px 18px;color:#64748b;font-size:13px;">Lead operator</td><td style="padding:14px 18px;color:#0f172a;font-size:14px;font-weight:600;text-align:right;">${escape(operatorName)}</td></tr>` : ''}
              </table>

              ${scopeOfWork ? `<div style="margin:0 0 24px;padding:18px 20px;background-color:#f1f5f9;border-left:3px solid #7c3aed;border-radius:6px;"><p style="margin:0 0 6px;color:#0f172a;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.4px;">Scope of work</p><p style="margin:0;color:#475569;font-size:14px;line-height:1.6;">${escape(scopeOfWork)}</p></div>` : ''}

              ${photoRows.length ? `<p style="margin:24px 0 8px;color:#0f172a;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.4px;">Site photos</p><table style="width:100%;border-collapse:collapse;margin:0 0 24px;">${photoRows.join('')}</table>` : ''}

              <p style="margin:0 0 8px;color:#475569;font-size:14px;line-height:1.6;">
                If you have any questions about this job or need additional services, please don&rsquo;t hesitate to reach out${companyPhone ? ` at <strong style="color:#0f172a;">${escape(companyPhone)}</strong>` : ''}.
              </p>
              <p style="margin:24px 0 0;color:#0f172a;font-size:14px;line-height:1.6;">
                With appreciation,<br/>
                <strong>The ${escape(companyName)} Team</strong>
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8fafc;padding:20px 32px;text-align:center;border-top:1px solid #e2e8f0;">
              <p style="margin:0;color:#94a3b8;font-size:12px;">This is an automated message from ${escape(companyName)}. Please do not reply.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}
