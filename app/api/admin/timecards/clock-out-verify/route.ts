export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/timecards/clock-out-verify
 * Approve or reject an out-of-radius / remote clock-out.
 * Sets clock_out_verified (true=approved, false=rejected) + who/when.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const { timecard_id, approved } = body;

    if (!timecard_id || typeof approved !== 'boolean') {
      return NextResponse.json(
        { error: 'timecard_id and approved (boolean) are required' },
        { status: 400 }
      );
    }

    let updateQuery = supabaseAdmin
      .from('timecards')
      .update({
        clock_out_verified: approved,
        clock_out_verified_by: auth.userId,
        clock_out_verified_at: new Date().toISOString(),
      })
      .eq('id', timecard_id);

    if (auth.tenantId) updateQuery = updateQuery.eq('tenant_id', auth.tenantId);

    const { data, error } = await updateQuery.select().single();

    if (error) {
      console.error('Error verifying clock-out:', error);
      return NextResponse.json({ error: 'Failed to verify clock-out' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data,
      message: approved ? 'Clock-out approved' : 'Clock-out rejected',
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
