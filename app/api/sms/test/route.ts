/**
 * API Route: POST /api/sms/test
 * Test SMS functionality
 * SECURITY: Requires admin authentication
 */

import { NextRequest, NextResponse } from 'next/server';
import { sendSMS } from '@/lib/sms';
import { requireAdmin } from '@/lib/api-auth';

export async function POST(request: NextRequest) {
  try {
    // SECURITY: Only admins can use the SMS test endpoint
    const auth = await requireAdmin(request);
    if (!auth.authorized) {
      return auth.response;
    }

    const body = await request.json();
    const { to, message } = body;

    if (!to || !message) {
      return NextResponse.json(
        { error: 'Missing required fields: to, message' },
        { status: 400 }
      );
    }

    console.log(`[sms/test] Admin ${auth.userId} sending test SMS to: ${to}`);

    const result = await sendSMS({ to, message });

    if (result.success) {
      return NextResponse.json({
        success: true,
        messageId: result.messageId,
        message: 'SMS sent successfully!',
      });
    } else {
      return NextResponse.json(
        { success: false, error: 'SMS sending failed' },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('[sms/test] Internal error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
