export const dynamic = 'force-dynamic';

/**
 * API Route: POST /api/admin/jobs/[id]/send-signature-request
 * Sends a digital signature request link to a customer via email.
 * Creates a signature_request row and emails the signing URL.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';
import { sendEmail, getTenantEmailBranding, generateSignatureRequestEmail } from '@/lib/email';
import { sendSignatureRequestSMS } from '@/lib/sms';
import crypto from 'crypto';
import { resolveAppOrigin } from '@/lib/app-url';

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

    // Fetch tenant company name for the SMS (email uses getTenantEmailBranding).
    let companyName = 'Your Service Provider';
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

    const appUrl = resolveAppOrigin();
    const signingUrl = `${appUrl}/sign/${token}`;
    const jobLabel = job.project_name || job.title || job.job_number;
    const jobDate = job.scheduled_date
      ? new Date(job.scheduled_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : null;
    const jobLocation = job.address || job.location || job.job_location || null;

    // Send email — white-labeled from the tenant's full branding.
    const branding = await getTenantEmailBranding(tenantId);
    const html = await generateSignatureRequestEmail({
      branding,
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

    // Send SMS if a phone number was provided
    let smsSent = false;
    if (customer_phone) {
      const smsResult = await sendSignatureRequestSMS({
        to: customer_phone,
        customerName: customer_name || job.customer_name,
        jobNumber: job.job_number,
        companyName,
        signingUrl,
      });
      smsSent = smsResult.success;
      if (!smsResult.success) {
        console.warn('SMS failed to send for signature request:', smsResult.error);
      }
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
          sent_sms_to: customer_phone || null,
          token: token.slice(0, 8) + '…',
          email_sent: emailSent,
          sms_sent: smsSent,
        },
      })
    ).then(() => {}).catch(() => {});

    return NextResponse.json({
      success: true,
      data: {
        token,
        signing_url: signingUrl,
        sent_to: customer_email,
        sent_sms_to: customer_phone || null,
        email_sent: emailSent,
        sms_sent: smsSent,
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

    const appUrl = resolveAppOrigin();

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

