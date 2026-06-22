export const dynamic = 'force-dynamic';

/**
 * API Route: POST /api/liability-release/pdf
 * Generate PDF of liability release and send via email
 */

import React from 'react';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';
import { renderToBuffer } from '@react-pdf/renderer';
import { LiabilityReleasePDF } from '@/components/pdf/LiabilityReleasePDF';
import { Resend } from 'resend';
import {
  VERIFIED_EMAIL_DOMAIN,
  getResendApiKey,
  getTenantEmailBranding,
  generateCompletionThankYouEmail,
} from '@/lib/email';
import { getTenantId } from '@/lib/get-tenant-id';

export async function POST(request: NextRequest) {
  try {
    console.log('[LIABILITY PDF] Starting PDF generation...');

    // SECURITY: Require authenticated user
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    // Parse request body
    const body = await request.json();
    const {
      jobId,
      customerName,
      customerEmail,
      operatorName,
      signatureDataURL,
      jobNumber,
      jobAddress
    } = body;

    console.log('[LIABILITY PDF] Request data:', {
      jobId,
      customerName,
      customerEmail,
      operatorName,
      jobNumber
    });

    // Validate required fields
    if (!jobId || !customerName || !customerEmail || !operatorName || !signatureDataURL) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Check if this is the demo operator
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('email, full_name')
      .eq('id', auth.userId)
      .single();

    const isDemoOperator = profile?.email === 'demo@pontifex.com' ||
                          profile?.full_name === 'Demo Operator';

    console.log('[LIABILITY PDF] Is demo operator:', isDemoOperator);

    if (isDemoOperator) {
      console.log('[LIABILITY PDF] Skipping PDF generation for demo operator');
      return NextResponse.json({
        success: true,
        message: 'Demo mode - PDF generation skipped',
        isDemoMode: true
      }, { status: 200 });
    }

    // Fetch branding for PDF
    let pdfBranding: Record<string, unknown> = {};
    try {
      const { data: brandingRow } = await supabaseAdmin
        .from('tenant_branding')
        .select('company_name, support_phone, support_email, pdf_footer_text, pdf_show_logo, primary_color, logo_url')
        .limit(1)
        .single();
      if (brandingRow) {
        pdfBranding = {
          company_name: brandingRow.company_name,
          support_phone: brandingRow.support_phone,
          support_email: brandingRow.support_email,
          pdf_footer_text: brandingRow.pdf_footer_text,
          pdf_show_logo: brandingRow.pdf_show_logo,
          primary_color: brandingRow.primary_color,
          logo_url: brandingRow.logo_url,
        };
      }
    } catch {
      // Use defaults if branding fetch fails
    }

    // Generate PDF
    console.log('[LIABILITY PDF] Generating PDF document...');
    const pdfElement = LiabilityReleasePDF({
      customerName,
      customerEmail,
      operatorName,
      signatureDataURL,
      jobNumber: jobNumber || jobId,
      jobAddress: jobAddress || 'N/A',
      signedAt: new Date().toISOString(),
      branding: pdfBranding as any,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfBuffer = await renderToBuffer(pdfElement as any);

    console.log('[LIABILITY PDF] PDF generated, size:', pdfBuffer.length, 'bytes');

    // Convert buffer to base64 for storage
    const pdfBase64 = pdfBuffer.toString('base64');

    // Store PDF in job order
    const { error: updateError } = await supabaseAdmin
      .from('job_orders')
      .update({
        liability_release_pdf: pdfBase64
      })
      .eq('id', jobId);

    if (updateError) {
      console.error('[LIABILITY PDF] Error storing PDF:', updateError);
      return NextResponse.json(
        { error: 'Failed to store PDF' },
        { status: 500 }
      );
    }

    console.log('[LIABILITY PDF] PDF stored in database');

    // Send email with PDF attachment
    console.log('[LIABILITY PDF] Sending email to:', customerEmail);

    try {
      // White-label branding (logo/colors/name) from the job's tenant — never a
      // hardcoded Patriot/Pontifex. Fall back to the platform default on lookup miss.
      const liabilityTenantId = await getTenantId(auth.userId);
      const branding = await getTenantEmailBranding(liabilityTenantId);
      const emailCompanyName = branding.companyName;
      const emailPhone = (pdfBranding.support_phone as string) || null;
      const emailSupportAddr = (pdfBranding.support_email as string) || null;
      const resend = new Resend(getResendApiKey());
      const html = await generateCompletionThankYouEmail({
        variant: 'liability',
        branding,
        jobNumber: jobNumber || jobId,
        customerName,
        location: jobAddress || 'N/A',
        operatorName,
        companyPhone: emailPhone,
        supportEmail: emailSupportAddr,
        signedDate: new Date().toLocaleDateString(),
      });
      const emailResult = await resend.emails.send({
        // VERIFIED Resend domain — do not use RESEND_FROM_EMAIL (was misconfigured to the unverified root).
        from: `${emailCompanyName} <noreply@${VERIFIED_EMAIL_DOMAIN}>`,
        to: customerEmail,
        subject: `Liability Release - Job #${jobNumber || jobId}`,
        html,
        attachments: [
          {
            filename: `Liability_Release_${jobNumber || jobId}_${new Date().toISOString().split('T')[0]}.pdf`,
            content: pdfBuffer
          }
        ]
      });

      console.log('[LIABILITY PDF] Email sent successfully:', emailResult);

      return NextResponse.json({
        success: true,
        message: 'PDF generated and email sent successfully',
        emailId: emailResult.data?.id
      }, { status: 200 });

    } catch (emailError: any) {
      console.error('[LIABILITY PDF] Email sending failed:', emailError);

      // Even if email fails, we still saved the PDF
      return NextResponse.json({
        success: true,
        message: 'PDF generated and stored, but email failed to send',
        warning: emailError.message
      }, { status: 200 });
    }

  } catch (error: any) {
    console.error('[LIABILITY PDF] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
