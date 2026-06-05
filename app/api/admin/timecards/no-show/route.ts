export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/timecards/no-show
 *
 * Admin-only no-show recorder. Marks an operator as a no-call/no-show for a day,
 * landing the record ON the operator's timecard (payroll visibility) AND on the
 * schedule/availability ledger (operator_time_off) so both systems converge on
 * ONE row per (operator, date).
 *
 * Body: { user_id, date, notes? }
 *
 * Unified data model (TIMECARD_SETTINGS_PLAN.md §2.1):
 *   - timecards row: entry_type='no_call_no_show', hour_type='no_show', 0 paid hours.
 *     Idempotent via the partial unique index `timecards_one_no_show_per_day`
 *     (ON CONFLICT DO NOTHING).
 *   - operator_time_off row: type='no_show', is_callout=true, pto_days_used=0,
 *     upserted on (operator_id, date) — converges with schedule-board "Mark Out".
 *   - operator_pto_balance.callout_count bumped ONCE, only when the
 *     operator_time_off no_show row was newly inserted (guard against double-count
 *     on idempotent re-run).
 *
 * DELETE /api/admin/timecards/no-show?id=<timecardId>  (or ?user_id=&date=)
 *   - Removes the no-show timecards row AND the matching operator_time_off no_show
 *     row; decrements callout_count if it had been counted. Lets admin undo.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';
import { sendPushToUser } from '@/lib/send-push';

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;
  if (!auth.tenantId) return NextResponse.json({ error: 'Tenant required' }, { status: 400 });

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const user_id = body.user_id;
  const date = body.date;
  const notes = body.notes ? String(body.notes).trim() : null;

  if (!user_id) return NextResponse.json({ error: 'user_id is required' }, { status: 400 });
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
  }

  // Verify the target user belongs to this tenant (mirror manual/route.ts:62-70)
  const { data: targetProfile, error: profErr } = await supabaseAdmin
    .from('profiles')
    .select('id, tenant_id, full_name, role')
    .eq('id', user_id)
    .single();
  if (profErr || !targetProfile) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (auth.role !== 'super_admin' && targetProfile.tenant_id !== auth.tenantId) {
    return NextResponse.json({ error: 'User not in your tenant' }, { status: 403 });
  }

  // No-show day clock_in_time = <date>T00:00 LOCAL (satisfies NOT NULL); 0 duration.
  // Build it from local components so it doesn't shift a day in negative-offset zones.
  const clockIso = new Date(`${date}T00:00:00`).toISOString();

  // Derive work_location from role (mirror manual route :78-79)
  const shopRoles = new Set(['shop_manager', 'shop_help']);
  const workLocation = shopRoles.has((targetProfile as any).role ?? '') ? 'shop' : 'field';

  // Zero-hour timecard row (mirror manual route column set so it renders consistently)
  const insert: Record<string, unknown> = {
    user_id,
    tenant_id: auth.tenantId,
    date,
    clock_in_time: clockIso,
    clock_out_time: clockIso,
    total_hours: 0,
    gross_hours: 0,
    net_hours: 0,
    regular_hours: 0,
    is_approved: true,
    approval_status: 'manually_approved',
    approved_by: auth.userId,
    approved_at: new Date().toISOString(),
    clock_in_method: 'manual',
    clock_out_method: 'manual',
    entry_type: 'no_call_no_show',
    hour_type: 'no_show',
    timecard_source: 'manual',
    admin_notes: notes,
    notes,
    work_location: workLocation,
    is_shop_hours: false,
    is_night_shift: false,
    auto_lunch_applied: false,
    lunch_duration_minutes: 0,
    break_minutes: 0,
  };

  // Idempotent: the partial unique index timecards_one_no_show_per_day
  // ((user_id, date) WHERE entry_type='no_call_no_show') guarantees at most one
  // no-show row per operator/day. We pre-check, then insert, and also treat a
  // unique-violation (23505) as a benign no-op in case of a race.
  const { data: existingNoShow } = await supabaseAdmin
    .from('timecards')
    .select('id')
    .eq('user_id', user_id)
    .eq('date', date)
    .eq('entry_type', 'no_call_no_show')
    .maybeSingle();

  let created = false;
  let tcRow: { id: string } | null = existingNoShow ?? null;

  if (!existingNoShow) {
    const { data: inserted, error: tcErr } = await supabaseAdmin
      .from('timecards')
      .insert(insert)
      .select('id')
      .single();

    if (tcErr && tcErr.code !== '23505') {
      console.error('no-show timecard POST error:', tcErr);
      return NextResponse.json({ error: 'Failed to record no-show', details: tcErr.message }, { status: 500 });
    }
    if (inserted) { tcRow = inserted; created = true; }
  }

  // ── operator_time_off convergence (schedule/availability + callout ledger) ──
  // Check first so we can guard the callout_count bump to a single increment.
  const { data: existingTimeOff } = await supabaseAdmin
    .from('operator_time_off')
    .select('id')
    .eq('operator_id', user_id)
    .eq('date', date)
    .eq('type', 'no_show')
    .maybeSingle();
  const timeOffWasNew = !existingTimeOff;

  const { error: toErr } = await supabaseAdmin
    .from('operator_time_off')
    .upsert(
      {
        operator_id: user_id,
        date,
        type: 'no_show',
        request_type: 'no_show',
        is_paid: false,
        is_callout: true,
        callout_reason: notes,
        pto_days_used: 0,
        status: 'approved',
        notes,
        approved_by: auth.userId,
        approved_at: new Date().toISOString(),
        created_by: auth.userId,
        tenant_id: auth.tenantId,
      },
      { onConflict: 'operator_id,date', ignoreDuplicates: false }
    );
  if (toErr) {
    // Non-fatal: the timecard (payroll record) is the primary write.
    console.warn('no-show operator_time_off upsert failed (non-fatal):', toErr.message);
  }

  // Bump callout_count ONLY when the operator_time_off no_show row was newly created
  // (guard against double-count on idempotent re-run). Mirrors upsertPtoBalance.
  if (timeOffWasNew && !toErr) {
    const year = parseInt(date.slice(0, 4), 10);
    Promise.resolve(bumpCalloutCount(user_id, auth.tenantId, year, 1)).catch(() => {});
  }

  // ── Admin notification (mirror time-off/route.ts:186-225) ──
  const operatorName = (targetProfile as any).full_name ?? 'An operator';
  const msg = `${operatorName} marked NO-SHOW on ${date}${notes ? ` — ${notes}` : ''}`;
  Promise.resolve(
    (async () => {
      const { data: admins } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('tenant_id', auth.tenantId)
        .in('role', ['admin', 'super_admin', 'operations_manager']);
      if (admins && admins.length > 0) {
        const notifRows = admins.map((a: { id: string }) => ({
          user_id: a.id,
          tenant_id: auth.tenantId,
          type: 'warning',
          title: 'No-Show Recorded',
          message: msg,
          notification_type: 'operator_callout',
          related_entity_type: 'operator_time_off',
          action_url: '/dashboard/admin/timecards',
        }));
        await supabaseAdmin.from('notifications').insert(notifRows);
        for (const a of admins as { id: string }[]) {
          sendPushToUser(a.id, {
            title: 'No-Show Recorded',
            body: msg,
            data: { route: '/dashboard/admin/timecards' },
          }).catch(() => {});
        }
      }
    })()
  ).catch(() => {});

  // ── Audit log fire-and-forget (mirror manual/route.ts:156-165) ──
  Promise.resolve(
    supabaseAdmin.from('audit_logs').insert({
      action: 'admin_no_show_recorded',
      actor_id: auth.userId,
      resource_type: 'timecard',
      resource_id: tcRow?.id ?? null,
      details: { user_id, date, entry_type: 'no_call_no_show', notes, created },
      tenant_id: auth.tenantId,
    })
  ).catch(() => {});

  return NextResponse.json({ success: true, created });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;
  if (!auth.tenantId) return NextResponse.json({ error: 'Tenant required' }, { status: 400 });

  const sp = request.nextUrl.searchParams;
  const id = sp.get('id');
  let user_id = sp.get('user_id');
  let date = sp.get('date');

  // Resolve user_id + date from the timecard id when only ?id= is supplied.
  if (id && (!user_id || !date)) {
    const { data: tc } = await supabaseAdmin
      .from('timecards')
      .select('user_id, date, tenant_id')
      .eq('id', id)
      .maybeSingle();
    if (!tc) return NextResponse.json({ error: 'No-show entry not found' }, { status: 404 });
    if (auth.role !== 'super_admin' && tc.tenant_id !== auth.tenantId) {
      return NextResponse.json({ error: 'Entry not in your tenant' }, { status: 403 });
    }
    user_id = tc.user_id;
    date = tc.date;
  }

  if (!user_id || !date) {
    return NextResponse.json({ error: 'Provide ?id= or ?user_id=&date=' }, { status: 400 });
  }

  // Delete the no-show timecards row (scoped to entry_type so we never nuke real hours).
  let tcDelete = supabaseAdmin
    .from('timecards')
    .delete()
    .eq('user_id', user_id)
    .eq('date', date)
    .eq('entry_type', 'no_call_no_show');
  if (auth.role !== 'super_admin') tcDelete = tcDelete.eq('tenant_id', auth.tenantId);
  const { error: tcErr } = await tcDelete;
  if (tcErr) {
    console.error('no-show DELETE timecard error:', tcErr);
    return NextResponse.json({ error: 'Failed to remove no-show timecard', details: tcErr.message }, { status: 500 });
  }

  // Did an operator_time_off no_show row exist (so callout_count was counted)?
  const { data: existingTimeOff } = await supabaseAdmin
    .from('operator_time_off')
    .select('id')
    .eq('operator_id', user_id)
    .eq('date', date)
    .eq('type', 'no_show')
    .maybeSingle();
  const hadCallout = !!existingTimeOff;

  let toDelete = supabaseAdmin
    .from('operator_time_off')
    .delete()
    .eq('operator_id', user_id)
    .eq('date', date)
    .eq('type', 'no_show');
  if (auth.role !== 'super_admin') toDelete = toDelete.eq('tenant_id', auth.tenantId);
  await toDelete;

  // Decrement callout_count if it had been counted (don't go below 0).
  if (hadCallout) {
    const year = parseInt(date.slice(0, 4), 10);
    Promise.resolve(bumpCalloutCount(user_id, auth.tenantId, year, -1)).catch(() => {});
  }

  // Audit log fire-and-forget
  Promise.resolve(
    supabaseAdmin.from('audit_logs').insert({
      action: 'admin_no_show_removed',
      actor_id: auth.userId,
      resource_type: 'timecard',
      resource_id: id ?? null,
      details: { user_id, date },
      tenant_id: auth.tenantId,
    })
  ).catch(() => {});

  return NextResponse.json({ success: true });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Adjust operator_pto_balance.callout_count by `delta` (+1 on record, -1 on undo).
 * Mirrors the guard style in time-off/route.ts:upsertPtoBalance; never goes below 0.
 */
async function bumpCalloutCount(
  operatorId: string,
  tenantId: string | null,
  year: number,
  delta: number
): Promise<void> {
  const { data: existing } = await supabaseAdmin
    .from('operator_pto_balance')
    .select('id, callout_count')
    .eq('operator_id', operatorId)
    .eq('year', year)
    .maybeSingle();

  if (existing) {
    const next = Math.max(0, (existing.callout_count || 0) + delta);
    await supabaseAdmin
      .from('operator_pto_balance')
      .update({ callout_count: next, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
  } else if (delta > 0) {
    await supabaseAdmin.from('operator_pto_balance').insert({
      operator_id: operatorId,
      tenant_id: tenantId,
      year,
      pto_days_allocated: 10,
      pto_days_used: 0,
      callout_count: delta,
    });
  }
}
