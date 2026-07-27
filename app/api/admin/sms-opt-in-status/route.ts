export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/sms-opt-in-status?phone=... — ADMIN/STAFF (bearer auth)
 *
 * Returns the SMS opt-in state for a phone so the "Send opt-in request" button
 * can show Send → Sent (pending) → Opted in. Matched by E.164 phone because the
 * public consent route stores tenant_id=null (phone is the stable key).
 *
 * state: 'none' | 'pending' | 'accepted' | 'revoked'
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { formatPhoneNumber } from '@/lib/sms';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const rawPhone = new URL(request.url).searchParams.get('phone') || '';
    const phone = formatPhoneNumber(rawPhone);
    if (!phone) {
      return NextResponse.json({ success: true, state: 'none' });
    }

    const { data: rows } = await supabaseAdmin
      .from('sms_consent')
      .select('consented, revoked_at, requested_at, created_at')
      .eq('phone', phone)
      .order('created_at', { ascending: false });

    const list = rows || [];
    const accepted = list.find((r: any) => r.consented && !r.revoked_at);
    if (accepted) {
      return NextResponse.json({ success: true, state: 'accepted', since: accepted.created_at });
    }
    // A consented row that was later revoked (customer texted STOP).
    const revoked = list.find((r: any) => r.consented && r.revoked_at);
    if (revoked) {
      return NextResponse.json({ success: true, state: 'revoked', since: revoked.revoked_at });
    }
    const pending = list.find((r: any) => r.requested_at);
    if (pending) {
      return NextResponse.json({ success: true, state: 'pending', since: pending.requested_at });
    }
    return NextResponse.json({ success: true, state: 'none' });
  } catch (error) {
    console.error('Error in GET /api/admin/sms-opt-in-status:', error);
    return NextResponse.json({ success: true, state: 'none' });
  }
}
