/**
 * API Route: POST /api/send-email
 * Sends emails with optional PDF attachments using Resend
 */

import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY || 're_dummy_key_for_build');

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { to, subject, html, pdfUrl, pdfName } = body;

    if (!to || !subject || !html) {
      return NextResponse.json(
        { error: 'Missing required fields: to, subject, html' },
        { status: 400 }
      );
    }

    console.log(`📧 Sending email to: ${to}`);
    console.log(`📧 Subject: ${subject}`);

    // Check if Resend API key is configured
    if (!process.env.RESEND_API_KEY) {
      console.warn('⚠️ RESEND_API_KEY not configured. Email will not be sent.');
      console.log('📧 Email HTML (for development):');
      console.log(html);
      return NextResponse.json(
        {
          success: false,
          error: 'Email service not configured',
          message: 'RESEND_API_KEY not found in environment variables'
        },
        { status: 500 }
      );
    }

    // Prepare email options
    const emailOptions: any = {
      from: process.env.RESEND_FROM_EMAIL || 'Pontifex Industries <onboarding@resend.dev>',
      to: [to],
      subject: subject,
      html: html,
    };

    // If PDF URL is provided, fetch and attach it
    if (pdfUrl && pdfName) {
      try {
        console.log(`📎 Fetching PDF from: ${pdfUrl}`);

        // Fetch the PDF from the provided URL
        const pdfResponse = await fetch(pdfUrl);

        if (!pdfResponse.ok) {
          console.error('❌ Failed to fetch PDF:', pdfResponse.statusText);
          return NextResponse.json(
            { error: 'Failed to fetch PDF attachment' },
            { status: 500 }
          );
        }

        // Get PDF as buffer
        const pdfBuffer = await pdfResponse.arrayBuffer();
        const pdfBase64 = Buffer.from(pdfBuffer).toString('base64');

        console.log(`📎 PDF fetched successfully (${(pdfBuffer.byteLength / 1024).toFixed(2)} KB)`);

        // Add attachment to email
        emailOptions.attachments = [
          {
            filename: pdfName,
            content: pdfBase64,
          }
        ];
      } catch (pdfError) {
        console.error('❌ Error processing PDF attachment:', pdfError);
        // Continue sending email without attachment rather than failing completely
      }
    }

    // Send email using Resend
    const { data, error } = await resend.emails.send(emailOptions);

    if (error) {
      console.error('❌ Error sending email via Resend:', error);
      return NextResponse.json(
        { error: 'Failed to send email', details: error },
        { status: 500 }
      );
    }

    console.log('✅ Email sent successfully via Resend!');
    console.log('📧 Email ID:', data?.id);

    return NextResponse.json({
      success: true,
      emailId: data?.id,
      message: 'Email sent successfully'
    });

  } catch (error: any) {
    console.error('❌ Error in send-email API:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
