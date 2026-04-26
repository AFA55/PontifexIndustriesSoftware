export const dynamic = 'force-dynamic';

/**
 * API Route: POST /api/job-orders/[id]/send-completion-sms
 * Send an SMS to the customer with a completion signature link.
 * Falls back to dev-log if no SMS provider is configured.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { formatPhoneNumber } from '@/lib/sms';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const { phoneNumber, signUrl, jobNumber, customerName } = body;

    if (!phoneNumber || !signUrl) {
      return NextResponse.json(
        { error: 'phoneNumber and signUrl are required' },
        { status: 400 }
      );
    }

    const formattedPhone = formatPhoneNumber(phoneNumber);
    if (!formattedPhone) {
      return NextResponse.json(
        { error: 'Invalid phone number format' },
        { status: 400 }
      );
    }

    const jobLabel = jobNumber || 'your job';
    const message = `Patriot Concrete Cutting has completed work on your project (${jobLabel}). Please review the work performed and sign here: ${signUrl}`;

    // ── Try Telnyx ──────────────────────────────────────────────────────────
    const telnyxApiKey = process.env.TELNYX_API_KEY;
    const telnyxFrom = process.env.TELNYX_PHONE_NUMBER;

    if (telnyxApiKey && telnyxFrom) {
      try {
        const resp = await fetch('https://api.telnyx.com/v2/messages', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${telnyxApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ from: telnyxFrom, to: formattedPhone, text: message }),
        });
        if (resp.ok) {
          return NextResponse.json({ success: true, method: 'telnyx' });
        }
        const errBody = await resp.text();
        console.warn('[SMS] Telnyx error:', resp.status, errBody);
      } catch (e) {
        console.warn('[SMS] Telnyx fetch failed:', e);
      }
    }

    // ── Try Twilio SDK (via lib/sms.ts) ─────────────────────────────────────
    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioFrom = process.env.TWILIO_PHONE_NUMBER;

    if (twilioSid && twilioToken && twilioFrom) {
      try {
        const encoded = Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64');
        const resp = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
          {
            method: 'POST',
            headers: {
              Authorization: `Basic ${encoded}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              From: twilioFrom,
              To: formattedPhone,
              Body: message,
            }).toString(),
          }
        );
        if (resp.ok) {
          return NextResponse.json({ success: true, method: 'twilio' });
        }
        const errBody = await resp.text();
        console.warn('[SMS] Twilio error:', resp.status, errBody);
      } catch (e) {
        console.warn('[SMS] Twilio fetch failed:', e);
      }
    }

    // ── Dev / no-provider fallback ───────────────────────────────────────────
    console.log(`[DEV SMS] To: ${formattedPhone}\nJob: ${jobLabel}\nMessage: ${message}`);
    return NextResponse.json({ success: true, method: 'dev_log', sign_url: signUrl });
  } catch (error: any) {
    console.error('Error in send-completion-sms:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
