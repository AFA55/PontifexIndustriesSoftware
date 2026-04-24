export const dynamic = 'force-dynamic';

/**
 * API Route: POST /api/admin/jobs/[id]/send-signature-request
 * Sends a digital signature request link to a customer via email.
 * Creates a signature_request row and emails the signing URL.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';
import { sendEmail } from '@/lib/email';
import crypto from 'crypto';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId } = await context.params;
    const tenantId = auth.tenantId;

    const body = await request.json();
    const { customer_email, customer_name, customer_phone } = body;

    if (!customer_email) {
      return NextResponse.json({ error: 'customer_email is required' }, { status: 400 });
    }

    // Fetch job — verify it belongs to this tenant
    let jobQuery = supabaseAdmin
      .from('job_orders')
      .select('id, job_number, project_name, title, customer_name, address, location, job_location, scheduled_date, status')
      .eq('id', jobId);
    if (tenantId) jobQuery = jobQuery.eq('tenant_id', tenantId);

    const { data: job, error: jobError } = await jobQuery.single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Fetch tenant branding for email
    let companyName = 'Patriot Concrete Cutting';
    if (tenantId) {
      const { data: branding } = await supabaseAdmin
        .from('tenant_branding')
        .select('company_name')
        .eq('tenant_id', tenantId)
        .single();
      if (branding?.company_name) companyName = branding.company_name;
    }

    // Generate a secure 64-char hex token
    const token = crypto.randomBytes(32).toString('hex');

    // Create signature_request row
    const { data: sigReq, error: insertError } = await supabaseAdmin
      .from('signature_requests')
      .insert({
        job_order_id: jobId,
        token,
        contact_name: customer_name || job.customer_name,
        contact_email: customer_email,
        contact_phone: customer_phone || null,
        request_type: 'completion',
        status: 'sent',
        sent_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        created_by: auth.userId,
      })
      .select()
      .single();

    if (insertError || !sigReq) {
      console.error('Error creating signature request:', insertError);
      return NextResponse.json({ error: 'Failed to create signature request' }, { status: 500 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const signingUrl = `${appUrl}/sign/${token}`;
    const jobLabel = job.project_name || job.title || job.job_number;
    const jobDate = job.scheduled_date
      ? new Date(job.scheduled_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : null;
    const jobLocation = job.address || job.location || job.job_location || null;

    // Send email
    const html = generateSignatureRequestEmail({
      companyName,
      customerName: customer_name || job.customer_name,
      jobNumber: job.job_number,
      jobLabel,
      jobDate,
      jobLocation,
      signingUrl,
    });

    const emailSent = await sendEmail({
      to: customer_email,
      subject: `Please sign your work completion form — ${job.job_number}`,
      html,
    });

    if (!emailSent) {
      console.warn('Email failed to send but signature request was created. Token:', token);
      // Return success — the link is still created and can be manually shared
    }

    // Fire-and-forget audit log
    Promise.resolve(
      supabaseAdmin.from('audit_logs').insert({
        user_id: auth.userId,
        action: 'signature_request_sent',
        entity_type: 'job_order',
        entity_id: jobId,
        details: {
          job_number: job.job_number,
          sent_to: customer_email,
          token: token.slice(0, 8) + '…',
          email_sent: emailSent,
        },
      })
    ).then(() => {}).catch(() => {});

    return NextResponse.json({
      success: true,
      data: {
        token,
        signing_url: signingUrl,
        sent_to: customer_email,
        email_sent: emailSent,
        signature_request_id: sigReq.id,
      },
    });
  } catch (error: unknown) {
    console.error('Error in POST /send-signature-request:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET — check status of existing signature requests for a job
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId } = await context.params;
    const tenantId = auth.tenantId;

    // Verify job belongs to tenant
    let jobQuery = supabaseAdmin
      .from('job_orders')
      .select('id, customer_signature, customer_signed_at, customer_signature_method')
      .eq('id', jobId);
    if (tenantId) jobQuery = jobQuery.eq('tenant_id', tenantId);

    const { data: job, error: jobError } = await jobQuery.single();
    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Get latest completion-type signature requests for this job
    const { data: requests } = await supabaseAdmin
      .from('signature_requests')
      .select('id, token, contact_name, contact_email, status, sent_at, signed_at, expires_at, created_at')
      .eq('job_order_id', jobId)
      .eq('request_type', 'completion')
      .order('created_at', { ascending: false })
      .limit(5);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    return NextResponse.json({
      success: true,
      data: {
        job_signature: {
          customer_signature: !!job.customer_signature,
          customer_signed_at: job.customer_signed_at,
          customer_signature_method: job.customer_signature_method,
        },
        requests: (requests || []).map(r => ({
          ...r,
          signing_url: `${appUrl}/sign/${r.token}`,
          is_expired: new Date(r.expires_at) < new Date(),
        })),
      },
    });
  } catch (error: unknown) {
    console.error('Error in GET /send-signature-request:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── Email Template ──────────────────────────────────────────────────────────

function generateSignatureRequestEmail({
  companyName,
  customerName,
  jobNumber,
  jobLabel,
  jobDate,
  jobLocation,
  signingUrl,
}: {
  companyName: string;
  customerName: string;
  jobNumber: string;
  jobLabel: string;
  jobDate: string | null;
  jobLocation: string | null;
  signingUrl: string;
}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign Your Work Completion Form</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background-color:#f8fafc;color:#1e293b;">
  <table role="presentation" style="width:100%;border-collapse:collapse;background-color:#f8fafc;">
    <tr>
      <td style="padding:40px 20px;">
        <table role="presentation" style="max-width:560px;margin:0 auto;background-color:#ffffff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.08);overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%);padding:40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">${companyName}</h1>
              <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:13px;">Work Completion Sign-Off</p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 8px;color:#0f172a;font-size:24px;font-weight:700;">Your Signature is Requested</h2>
              <p style="margin:0 0 28px;color:#64748b;font-size:15px;line-height:1.6;">
                Hi ${customerName}, please review and sign the work completion form for your recent job with ${companyName}.
              </p>

              <!-- Job details card -->
              <table style="width:100%;border-collapse:collapse;background-color:#f1f5f9;border-radius:8px;margin-bottom:28px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 12px;color:#64748b;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;">Job Details</p>
                    <table style="width:100%;border-collapse:collapse;">
                      <tr>
                        <td style="padding:8px 0;color:#64748b;font-size:14px;border-top:1px solid #e2e8f0;width:40%;">Job Number</td>
                        <td style="padding:8px 0;color:#0f172a;font-size:14px;font-weight:600;text-align:right;border-top:1px solid #e2e8f0;">${jobNumber}</td>
                      </tr>
                      ${jobLabel !== jobNumber ? `<tr>
                        <td style="padding:8px 0;color:#64748b;font-size:14px;border-top:1px solid #e2e8f0;">Project</td>
                        <td style="padding:8px 0;color:#0f172a;font-size:14px;font-weight:600;text-align:right;border-top:1px solid #e2e8f0;">${jobLabel}</td>
                      </tr>` : ''}
                      ${jobDate ? `<tr>
                        <td style="padding:8px 0;color:#64748b;font-size:14px;border-top:1px solid #e2e8f0;">Date</td>
                        <td style="padding:8px 0;color:#0f172a;font-size:14px;font-weight:600;text-align:right;border-top:1px solid #e2e8f0;">${jobDate}</td>
                      </tr>` : ''}
                      ${jobLocation ? `<tr>
                        <td style="padding:8px 0;color:#64748b;font-size:14px;border-top:1px solid #e2e8f0;">Location</td>
                        <td style="padding:8px 0;color:#0f172a;font-size:14px;font-weight:600;text-align:right;border-top:1px solid #e2e8f0;">${jobLocation}</td>
                      </tr>` : ''}
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table role="presentation" style="width:100%;border-collapse:collapse;margin-bottom:28px;">
                <tr>
                  <td style="text-align:center;">
                    <a href="${signingUrl}" style="display:inline-block;padding:16px 48px;background-color:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-size:16px;font-weight:700;letter-spacing:0.2px;">
                      Sign Now →
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Link fallback -->
              <div style="background-color:#f8fafc;border-radius:6px;padding:16px 20px;margin-bottom:24px;">
                <p style="margin:0 0 8px;color:#64748b;font-size:12px;font-weight:600;">Button not working? Copy this link:</p>
                <p style="margin:0;color:#2563eb;font-size:12px;word-break:break-all;line-height:1.5;">${signingUrl}</p>
              </div>

              <!-- Notice -->
              <div style="background-color:#fffbeb;border-left:3px solid #f59e0b;border-radius:4px;padding:14px 18px;">
                <p style="margin:0;color:#78350f;font-size:13px;line-height:1.5;">
                  This link expires in <strong>7 days</strong>. You do not need an account to sign.
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f8fafc;padding:24px 40px;text-align:center;border-top:1px solid #e2e8f0;">
              <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.5;">
                ${companyName} &bull; This is an automated message. Please do not reply.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
