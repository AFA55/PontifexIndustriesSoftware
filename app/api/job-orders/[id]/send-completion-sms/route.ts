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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const { phoneNumber, signUrl, jobNumber } = body;

    if (!phoneNumber || !signUrl) {
      return NextResponse.json(
        { error: 'phoneNumber and signUrl are required' },
        { status: 400 }
      );
    }

    const formattedPhone = formatPhoneNumber(phoneNumber);
    if (!formattedPhone) {
      return NextResponse.json(
        { error: 'That phone number is not a valid US number.' },
        { status: 400 }
      );
    }

    const jobLabel = jobNumber || 'your job';

    // Resolve tenant + company name. tenant_id also drives usage metering, so
    // it is read from the profile rather than assumed.
    let tenantId: string | undefined;
    let companyName = 'Your contractor';
    try {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('tenant_id')
        .eq('id', auth.userId)
        .maybeSingle();
      if (profile?.tenant_id) {
        tenantId = profile.tenant_id;
        const { data: branding } = await supabaseAdmin
          .from('tenant_branding')
          .select('company_name')
          .eq('tenant_id', profile.tenant_id)
          .maybeSingle();
        if (branding?.company_name) companyName = branding.company_name;
      }
    } catch { /* use default */ }

    const message = `${companyName} has completed work on ${jobLabel}. Please review and sign here: ${signUrl}`;

    const startedAt = Date.now();
    const result = await sendSMSAny({
      to: formattedPhone,
      message,
      jobId: id,
      tenantId,
      source: 'completion_signature_sms',
    });
    const elapsedMs = Date.now() - startedAt;

    if (!result.success) {
      console.error(
        `[SMS] completion link FAILED for job ${id} after ${elapsedMs}ms:`,
        result.error
      );
      return NextResponse.json(
        { error: 'The text could not be sent. Check the number and try again.' },
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
