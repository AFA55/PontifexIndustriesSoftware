export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/timecards/apply-double-time
 *
 * Tag (or untag) specific people's timecards on a given date as DOUBLE-TIME —
 * their worked hours that day are paid at 2× the regular rate. Founder use case:
 * a worked holiday or a special day paid double for chosen crew.
 *
 * Body: { date: 'YYYY-MM-DD', user_ids: string[], enable?: boolean (default true) }
 *
 * Sets pay_type_override='double_time' (or null) on each matching card and
 * attributes the hours to double_time_hours (or back to regular). Idempotent;
 * only touches cards that already exist for that (user, date) in the caller's tenant.
 * Returns { success, applied, skipped }.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;
  if (!auth.tenantId) return NextResponse.json({ error: 'Tenant required' }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const date = typeof body.date === 'string' ? body.date : '';
  const userIds: string[] = Array.isArray(body.user_ids) ? body.user_ids.filter((x: unknown) => typeof x === 'string') : [];
  const enable = body.enable !== false; // default true

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
  }
  if (userIds.length === 0) {
    return NextResponse.json({ error: 'user_ids is required' }, { status: 400 });
  }

  // Load the target cards (tenant-scoped) for that date. Skip holiday-pay stubs —
  // double-time applies to the operator's WORKED card, never the auto-inserted
  // holiday row (tagging it would pay 1× holiday + 2× DT = triple).
  const { data: cards, error } = await supabaseAdmin
    .from('timecards')
    .select('id, user_id, total_hours, entry_type')
    .eq('tenant_id', auth.tenantId)
    .eq('date', date)
    .in('user_id', userIds);
  if (error) {
    console.error('apply-double-time — fetch error:', error);
    return NextResponse.json({ error: 'Failed to load timecards' }, { status: 500 });
  }

  const workedCards = (cards ?? []).filter((c) => c.entry_type !== 'holiday');
  const usersTouched = new Set<string>();
  for (const c of workedCards) {
    const total = Number(c.total_hours) || 0;
    const update = enable
      ? // DT-only: clear mandatory_overtime hour_type so a weekend card isn't counted
        // in BOTH the mandatory-OT and double-time buckets (would overpay).
        { pay_type_override: 'double_time', hour_type: 'regular', double_time_hours: total, regular_hours: 0, overtime_hours: 0, night_shift_premium_hours: 0 }
      : { pay_type_override: null, double_time_hours: 0, regular_hours: total, overtime_hours: 0 };
    const { error: uErr } = await supabaseAdmin
      .from('timecards')
      .update({ ...update, edited_by: auth.userId, edited_at: new Date().toISOString() })
      .eq('id', c.id)
      .eq('tenant_id', auth.tenantId);
    if (!uErr) usersTouched.add(c.user_id);
    else console.error('apply-double-time — update error:', uErr);
  }

  const applied = usersTouched.size;
  const skipped = Math.max(0, userIds.length - applied);

  Promise.resolve(
    supabaseAdmin.from('audit_logs').insert({
      action: enable ? 'admin_apply_double_time' : 'admin_clear_double_time',
      actor_id: auth.userId,
      resource_type: 'timecard',
      resource_id: null,
      details: { date, user_ids: userIds, applied, skipped },
      tenant_id: auth.tenantId,
    }),
  ).catch(() => {});

  return NextResponse.json({ success: true, applied, skipped });
}
