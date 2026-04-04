export const dynamic = 'force-dynamic';

/**
 * API Route: POST /api/send-sms
 * Send SMS notification (can integrate with Twilio, AWS SNS, etc.)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';

export async function POST(request: NextRequest) {
  try {
    // SECURITY: Require authenticated user
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;
    const tenantId = await getTenantId(auth.userId);

    // Parse request body
    const body = await request.json();
    const { to, message } = body;

    if (!to || !message) {
      return NextResponse.json(
        { error: 'Phone number and message are required' },
        { status: 400 }
      );
    }

    // Send SMS using Telnyx
    const telnyxApiKey = process.env.TELNYX_API_KEY;
    const telnyxPhoneNumber = process.env.TELNYX_PHONE_NUMBER;

    if (!telnyxApiKey || !telnyxPhoneNumber) {
      console.log('⚠️ Telnyx not configured. Logging SMS to console instead:');
      console.log('📱 SMS to send:');
      console.log('To:', to);
      console.log('Message:', message);
      console.log('From:', auth.userEmail);

      return NextResponse.json(
        {
          success: true,
          message: 'SMS logged to console (Telnyx not configured)',
          data: {
            to,
            sentAt: new Date().toISOString(),
          },
        },
        { status: 200 }
      );
    }

    try {
      // Send SMS via Telnyx API
      const telnyxResponse = await fetch('https://api.telnyx.com/v2/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${telnyxApiKey}`
        },
        body: JSON.stringify({
          from: telnyxPhoneNumber,
          to: to,
          text: message
        })
      });

      if (!telnyxResponse.ok) {
        const errorData = await telnyxResponse.json();
        console.error('❌ Telnyx API error:', errorData);
        throw new Error(`Telnyx API error: ${errorData.errors?.[0]?.detail || 'Unknown error'}`);
      }

      const telnyxData = await telnyxResponse.json();
      console.log('✅ SMS sent successfully via Telnyx');
      console.log('To:', to);
      console.log('Message:', message);

      return NextResponse.json(
        {
          success: true,
          message: 'SMS sent successfully via Telnyx',
          data: {
            to,
            sentAt: new Date().toISOString(),
            telnyxMessageId: telnyxData.data?.id,
          },
        },
        { status: 200 }
      );
    } catch (smsError: any) {
      console.error('❌ Error sending SMS via Telnyx:', smsError);

      // Fallback to logging
      console.log('📱 SMS to send (fallback):');
      console.log('To:', to);
      console.log('Message:', message);

      return NextResponse.json(
        {
          success: false,
          message: 'Failed to send SMS via Telnyx',
          error: smsError.message,
          data: {
            to,
            sentAt: new Date().toISOString(),
          },
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Unexpected error in SMS route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
