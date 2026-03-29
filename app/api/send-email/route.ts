/**
 * API Route: POST /api/send-email
 * Sends emails with optional PDF attachments using Resend
 * SECURITY: Requires authenticated user
 */

import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { requireAuth } from '@/lib/api-auth';

// Allowed domains for PDF URL fetching (SSRF protection)
const ALLOWED_PDF_DOMAINS = [
  'patriotconcretecutting.com',
  'www.patriotconcretecutting.com',
  'pontifex-industries-software-z8py.vercel.app',
  'localhost',
];

function isAllowedPdfUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_PDF_DOMAINS.some(domain =>
      parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`)
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    // SECURITY: Require authenticated user
    const auth = await requireAuth(request);
    if (!auth.authorized) {
      return auth.response;
    }

    const body = await request.json();
    const { to, subject, html, pdfUrl, pdfName } = body;

    if (!to || !subject || !html) {
      return NextResponse.json(
        { error: 'Missing required fields: to, subject, html' },
        { status: 400 }
      );
    }

    console.log(`[send-email] User ${auth.userId} sending email to: ${to}`);

    // Check if Resend API key is configured
    if (!process.env.RESEND_API_KEY) {
      console.warn('[send-email] RESEND_API_KEY not configured.');
      return NextResponse.json(
        { error: 'Email service not configured' },
        { status: 500 }
      );
    }

    // Prepare email options
    const emailOptions: any = {
      from: process.env.RESEND_FROM_EMAIL || 'Patriot Concrete Cutting <onboarding@resend.dev>',
      to: [to],
      subject: subject,
      html: html,
    };

    // If PDF URL is provided, fetch and attach it (with SSRF protection)
    if (pdfUrl && pdfName) {
      // SECURITY: Validate PDF URL against allowed domains
      if (!isAllowedPdfUrl(pdfUrl)) {
        console.error(`[send-email] SSRF blocked: ${pdfUrl}`);
        return NextResponse.json(
          { error: 'PDF URL not allowed' },
          { status: 400 }
        );
      }

      try {
        const pdfResponse = await fetch(pdfUrl);

        if (!pdfResponse.ok) {
          console.error('[send-email] Failed to fetch PDF:', pdfResponse.statusText);
          return NextResponse.json(
            { error: 'Failed to fetch PDF attachment' },
            { status: 500 }
          );
        }

        // Get PDF as buffer
        const pdfBuffer = await pdfResponse.arrayBuffer();
        const pdfBase64 = Buffer.from(pdfBuffer).toString('base64');

        // Add attachment to email
        emailOptions.attachments = [
          {
            filename: pdfName,
            content: pdfBase64,
          }
        ];
      } catch (pdfError) {
        console.error('[send-email] Error processing PDF attachment:', pdfError);
        // Continue sending email without attachment rather than failing completely
      }
    }

    // Send email using Resend
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { data, error } = await resend.emails.send(emailOptions);

    if (error) {
      console.error('[send-email] Resend error:', error);
      return NextResponse.json(
        { error: 'Failed to send email' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      emailId: data?.id,
      message: 'Email sent successfully'
    });

  } catch (error: any) {
    console.error('[send-email] Internal error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
