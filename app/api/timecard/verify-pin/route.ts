export const dynamic = 'force-dynamic';

/**
 * POST /api/timecard/verify-pin
 * Verify the daily shop PIN for on-site clock-in on devices without NFC support.
 *
 * The admin sets a daily PIN in Settings → Timecard → Daily PIN.
 * Operators enter it via the PIN pad in the NFCClockIn component.
 * A valid PIN confirms the operator is on-site (or has been given the daily code).
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const { pin_code } = body;

    if (!pin_code || typeof pin_code !== 'string' || pin_code.length < 4) {
      return NextResponse.json(
        { error: 'A valid PIN of at least 4 digits is required.' },
        { status: 400 }
      );
    }

    const today = new Date().toISOString().split('T')[0];

    // Look up today's PIN for this tenant
    let query = supabaseAdmin
      .from('shop_daily_pins')
      .select('id, pin_code, valid_date, expires_at')
      .eq('valid_date', today)
      .eq('pin_code', pin_code.trim());

    if (auth.tenantId) {
      query = query.eq('tenant_id', auth.tenantId);
    }

    const { data: pinRecord, error: pinError } = await query.maybeSingle();

    if (pinError) {
      console.error('Error verifying daily PIN:', pinError);
      return NextResponse.json({ error: 'Failed to verify PIN.' }, { status: 500 });
    }

    if (!pinRecord) {
      return NextResponse.json({
        success: false,
        error: 'Incorrect PIN. Ask your supervisor for today\'s shop code.',
      }, { status: 401 });
    }

    // Check expiry
    if (pinRecord.expires_at && new Date(pinRecord.expires_at) < new Date()) {
      return NextResponse.json({
        success: false,
        error: 'Today\'s PIN has expired. Ask your supervisor for the updated code.',
      }, { status: 401 });
    }

    return NextResponse.json({
      success: true,
      message: 'PIN verified successfully.',
    });
  } catch (error) {
    console.error('Unexpected error in POST /api/timecard/verify-pin:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
