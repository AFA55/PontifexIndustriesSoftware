export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/auto-dispatch
 *
 * Runs every 5 minutes (Vercel Cron, UTC). For each tenant that has
 * `features.auto_dispatch = true`, dispatches TODAY's assigned jobs once the
 * tenant's LOCAL clock has reached 7:05am — so operators see their day at 7:05
 * their time (Eastern for Patriot), correct across DST and any future tenant tz.
 *
 * Idempotency: dispatch flips dispatched_at NULL → now and only notifies
 * first-time jobs (see lib/dispatch.ts). So firing on several 5-min ticks inside
 * the window dispatches once; a human "Push Tickets" beforehand also can't be
 * double-sent. The tenant timezone check (not a UTC cron time) is what makes
 * 7:05 LOCAL correct — Vercel crons only run in UTC.
 *
 * Authorization: Bearer ${CRON_SECRET}  (fail-closed if env var unset).
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { dispatchJobsForTenant } from '@/lib/dispatch';
import { todayInTz, nowMinutesInTz, parseHHMM } from '@/lib/reminder-timing';

// Fire when local time is in [07:05, 07:20). The every-5-min cron hits ~3 ticks
// in that window; the dispatched_at guard makes all but the first a no-op.
const WINDOW_START = parseHHMM('07:05')!; // 425
const WINDOW_END = parseHHMM('07:20')!;   // 440

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: 'Not configured' }, { status: 503 });
  const authHeader = request.headers.get('authorization') || '';
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let dispatchedTotal = 0;
  const fired: { tenant_id: string; dispatched: number }[] = [];

  try {
    const { data: tenants } = await supabaseAdmin.from('tenants').select('id, timezone, features');
    if (!tenants) return NextResponse.json({ success: true, dispatchedTotal: 0 });

    for (const tenant of tenants as { id: string; timezone: string | null; features: Record<string, unknown> | null }[]) {
      const features = tenant.features || {};
      if (features.auto_dispatch !== true) continue; // toggle OFF → skip

      const tz = tenant.timezone || 'America/New_York';
      const nowMin = nowMinutesInTz(tz);
      if (nowMin < WINDOW_START || nowMin >= WINDOW_END) continue; // not 7:05 local yet

      try {
        const result = await dispatchJobsForTenant(tenant.id, todayInTz(tz));
        if (result.dispatched_count > 0) {
          dispatchedTotal += result.dispatched_count;
          fired.push({ tenant_id: tenant.id, dispatched: result.dispatched_count });
        }
      } catch (e) {
        console.error('[auto-dispatch] tenant', tenant.id, 'failed:', e);
      }
    }

    return NextResponse.json({ success: true, dispatchedTotal, fired });
  } catch (error) {
    console.error('[auto-dispatch] error:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
