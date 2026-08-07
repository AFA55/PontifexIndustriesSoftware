export const dynamic = 'force-dynamic';

/**
 * API Route: POST /api/job-orders/[id]/send-completion-sms
 * Send an SMS to the customer with a completion signature link.
 *
 * Delegates to `sendSMSAny` (lib/sms.ts) rather than hand-rolling the provider
 * calls. The hand-rolled copy that used to live here diverged in three ways
 * that mattered:
 *   1. It never metered the send, so completion texts were invisible in
 *      `message_usage` — unbillable and unmeasurable.
 *   2. It returned `{ success: true, method: 'dev_log' }` when NO provider was
 *      configured, so a production misconfiguration told the operator the
 *      customer had been texted when nobody had.
 *   3. It duplicated the Telnyx→Twilio fallback, which now only lives in one
 *      place.
 *
 * The send is timed and logged so a "the text arrived late" report can be
 * pinned on us or on the carrier instead of guessed at.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { formatPhoneNumber, sendSMSAny } from '@/lib/sms';
import { resolveAppOrigin } from '@/lib/app-url';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const { phoneNumber, signUrl } = body;

    if (!phoneNumber || !signUrl) {
      return NextResponse.json(
        { error: 'phoneNumber and signUrl are required' },
        { status: 400 }
      );
    }

    const formattedPhone = formatPhoneNumber(phoneNumber);
    if (!formattedPhone) {
      return NextResponse.json(
        { error: 'That phone number is not a valid number.' },
        { status: 400 }
      );
    }

    // The job must exist IN THE CALLER'S TENANT.
    //
    // Without this the route was an open SMS relay: any authenticated user
    // could post an arbitrary number and an arbitrary URL and have the platform
    // text it — and, since the send is now metered, have the tenant billed for
    // it. The sibling request-signature route has always checked this.
    // supabaseAdmin bypasses RLS, so the tenant filter is explicit.
    const tenantId = auth.tenantId;
    let jobQuery = supabaseAdmin
      .from('job_orders')
      .select('id, job_number')
      .eq('id', id);
    if (tenantId) jobQuery = jobQuery.eq('tenant_id', tenantId);
    const { data: job } = await jobQuery.maybeSingle();

    if (!job) {
      return NextResponse.json({ error: 'Job order not found' }, { status: 404 });
    }

    // The link is resolved from the signature request we hold for THIS job, not
    // taken from the request body — the body could name any URL at all.
    const { data: sigRequest } = await supabaseAdmin
      .from('signature_requests')
      .select('token')
      .eq('job_order_id', id)
      .eq('request_type', 'completion')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!sigRequest?.token) {
      return NextResponse.json(
        { error: 'No completion signature request exists for this job.' },
        { status: 400 }
      );
    }

    const trustedSignUrl = `${resolveAppOrigin(request.nextUrl.origin)}/sign/${sigRequest.token}`;

    let companyName = 'Your contractor';
    if (tenantId) {
      const { data: branding } = await supabaseAdmin
        .from('tenant_branding')
        .select('company_name')
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (branding?.company_name) companyName = branding.company_name;
    }

    const jobLabel = job.job_number || 'your job';
    const message = `${companyName} has completed work on ${jobLabel}. Please review and sign here: ${trustedSignUrl}`;

    const startedAt = Date.now();
    const result = await sendSMSAny({
      to: formattedPhone,
      message,
      jobId: id,
      tenantId: tenantId ?? undefined,
      source: 'completion_signature_sms',
    });
    const elapsedMs = Date.now() - startedAt;

    if (!result.success) {
      console.error(
        `[SMS] completion link FAILED for job ${id} after ${elapsedMs}ms:`,
        result.error
      );
      // Don't send an operator back to retype a number that was fine. A
      // provider that isn't configured is our problem, not his.
      const misconfigured = /not configured/i.test(result.error || '');
      return NextResponse.json(
        {
          error: misconfigured
            ? 'Texting is not set up on this account — call the office to get the link to the customer.'
            : 'The text could not be sent. Check the number and try again.',
        },
        { status: 502 }
      );
    }

    // Timing lives in the logs so "the text arrived 5 minutes late" can be
    // attributed. A fast accepted-by-provider time with a slow arrival is a
    // carrier queue, not our code.
    console.log(
      `[SMS] completion link accepted by ${result.provider} in ${elapsedMs}ms ` +
      `(job ${id}, message ${result.messageId ?? 'n/a'})`
    );

    return NextResponse.json({
      success: true,
      provider: result.provider,
      accepted_in_ms: elapsedMs,
    });
  } catch (error: any) {
    console.error('Error in send-completion-sms:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
