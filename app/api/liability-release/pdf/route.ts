/**
 * API Route: POST /api/liability-release/pdf
 * Generate PDF of liability release and send via email
 */

import React from 'react';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { renderToBuffer } from '@react-pdf/renderer';
import { LiabilityReleasePDF } from '@/components/pdf/LiabilityReleasePDF';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: NextRequest) {
  try {
    console.log('[LIABILITY PDF] Starting PDF generation...');

    // Get user from Supabase session
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    // Verify the token and get user
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

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
      .eq('id', user.id)
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

    // Generate PDF
    console.log('[LIABILITY PDF] Generating PDF document...');
    const pdfElement = LiabilityReleasePDF({
      customerName,
      customerEmail,
      operatorName,
      signatureDataURL,
      jobNumber: jobNumber || jobId,
      jobAddress: jobAddress || 'N/A',
      signedAt: new Date().toISOString()
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
        { error: 'Failed to store PDF', details: updateError.message },
        { status: 500 }
      );
    }

    console.log('[LIABILITY PDF] PDF stored in database');

    // Send email with PDF attachment
    console.log('[LIABILITY PDF] Sending email to:', customerEmail);

    try {
      const emailResult = await resend.emails.send({
        from: 'Pontifex Industries <noreply@pontifexindustries.com>',
        to: customerEmail,
        subject: `Liability Release - Job #${jobNumber || jobId}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #EA580C;">Pontifex Industries</h1>
            <h2 style="color: #334155;">Liability Release & Indemnification</h2>

            <p>Dear ${customerName},</p>

            <p>Thank you for working with Pontifex Industries. This email confirms that the Liability Release & Indemnification agreement has been signed for:</p>

            <div style="background: #F1F5F9; padding: 16px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 4px 0;"><strong>Job Number:</strong> ${jobNumber || jobId}</p>
              <p style="margin: 4px 0;"><strong>Location:</strong> ${jobAddress || 'N/A'}</p>
              <p style="margin: 4px 0;"><strong>Operator:</strong> ${operatorName}</p>
              <p style="margin: 4px 0;"><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
            </div>

            <p>Please find the signed liability release document attached to this email for your records.</p>

            <p>If you have any questions or concerns, please don't hesitate to contact us:</p>

            <div style="margin: 20px 0;">
              <p style="margin: 4px 0;"><strong>Phone:</strong> (833) 695-4288</p>
              <p style="margin: 4px 0;"><strong>Email:</strong> support@pontifexindustries.com</p>
            </div>

            <p>Thank you for choosing Pontifex Industries.</p>

            <p style="margin-top: 30px; color: #64748B; font-size: 14px;">
              This is an automated message. Please do not reply to this email.
            </p>
          </div>
        `,
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
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
