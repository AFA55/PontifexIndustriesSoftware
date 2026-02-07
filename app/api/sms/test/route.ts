/**
 * API Route: POST /api/sms/test
 * Test SMS functionality
 */

import { NextRequest, NextResponse } from 'next/server';
import { sendSMS } from '@/lib/sms';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { to, message } = body;

    if (!to || !message) {
      return NextResponse.json(
        { error: 'Missing required fields: to, message' },
        { status: 400 }
      );
    }

    const result = await sendSMS({ to, message });

    if (result.success) {
      return NextResponse.json({
        success: true,
        messageId: result.messageId,
        message: 'SMS sent successfully!',
      });
    } else {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Error in SMS test:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
