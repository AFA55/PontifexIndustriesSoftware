export const dynamic = 'force-dynamic';

/**
 * GET /api/operator/pto-balance?year=YYYY
 * Returns the AUTHENTICATED user's own PTO balance for the year.
 * Any authenticated user can read their own balance (operators see their PTO).
 * Admin-wide reads use /api/admin/operators/pto-balance instead.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;

  const { searchParams } = new URL(request.url);
  const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()), 10);

  const { data, error } = await supabaseAdmin
    .from('operator_pto_balance')
    .select('pto_days_allocated, pto_days_used, callout_count, year')
    .eq('operator_id', auth.userId)
    .eq('year', year)
    .maybeSingle();

  if (error) {
    console.error('operator/pto-balance GET error:', error);
    return NextResponse.json({ error: 'Failed to load PTO balance' }, { status: 500 });
  }

  const allocated = Number(data?.pto_days_allocated ?? 10); // default allotment when no row yet
  const used = Number(data?.pto_days_used ?? 0);
  const callouts = Number(data?.callout_count ?? 0);

  return NextResponse.json({
    success: true,
    data: { year, allocated, used, remaining: Math.max(0, allocated - used), callouts },
  });
}
