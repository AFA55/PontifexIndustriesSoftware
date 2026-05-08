export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/timecards/manual
 *
 * Admin-only manual time entry. Used when an operator didn't clock in
 * (PTO, sick day, holiday, or admin had to enter hours after the fact).
 *
 * Body:
 *   user_id        — required (operator/employee getting the entry)
 *   date           — required, YYYY-MM-DD
 *   entry_type     — 'pto' | 'sick' | 'holiday' | 'manual' | 'admin_adjustment'
 *   hours          — required, number 0.25..16
 *   start_time     — optional 'HH:MM' (defaults 08:00)
 *   notes          — optional admin note
 *
 * Behavior:
 *   - Inserts a timecard row with clock_in_time + clock_out_time computed
 *     from start_time + hours.
 *   - total_hours = hours, gross_hours = hours, net_hours = hours.
 *   - is_approved = true (admin entered it, no review needed).
 *   - clock_in_method = 'manual', clock_out_method = 'manual'.
 *   - For entry_type='pto', also increments operator_pto_balance.pto_days_used
 *     (1 day = 8 hours; partial days proportional).
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

const VALID_ENTRY_TYPES = new Set(['pto','sick','holiday','manual','admin_adjustment']);

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;
  if (!auth.tenantId) return NextResponse.json({ error: 'Tenant required' }, { status: 400 });

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const user_id = body.user_id;
  const date = body.date;
  const entry_type = body.entry_type;
  const hoursRaw = body.hours;
  const startTime = (body.start_time || '08:00') as string;
  const notes = body.notes ? String(body.notes).trim() : null;

  if (!user_id) return NextResponse.json({ error: 'user_id is required' }, { status: 400 });
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
  if (!VALID_ENTRY_TYPES.has(entry_type)) {
    return NextResponse.json({ error: `entry_type must be one of: ${Array.from(VALID_ENTRY_TYPES).join(', ')}` }, { status: 400 });
  }
  const hours = Number(hoursRaw);
  if (!Number.isFinite(hours) || hours < 0.25 || hours > 16) {
    return NextResponse.json({ error: 'hours must be between 0.25 and 16' }, { status: 400 });
  }
  if (!/^\d{2}:\d{2}$/.test(startTime)) {
    return NextResponse.json({ error: 'start_time must be HH:MM' }, { status: 400 });
  }

  // Verify the user belongs to this tenant
  const { data: targetProfile, error: profErr } = await supabaseAdmin
    .from('profiles')
    .select('id, tenant_id, full_name')
    .eq('id', user_id)
    .single();
  if (profErr || !targetProfile) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (auth.role !== 'super_admin' && targetProfile.tenant_id !== auth.tenantId) {
    return NextResponse.json({ error: 'User not in your tenant' }, { status: 403 });
  }

  // Build clock_in_time + clock_out_time as timestamps
  const clockInIso = new Date(`${date}T${startTime}:00`).toISOString();
  const clockOutIso = new Date(new Date(clockInIso).getTime() + hours * 3_600_000).toISOString();

  const insert: Record<string, unknown> = {
    user_id,
    tenant_id: auth.tenantId,
    date,
    clock_in_time: clockInIso,
    clock_out_time: clockOutIso,
    total_hours: parseFloat(hours.toFixed(2)),
    gross_hours: parseFloat(hours.toFixed(2)),
    net_hours: parseFloat(hours.toFixed(2)),
    regular_hours: parseFloat(hours.toFixed(2)),
    is_approved: true,
    approval_status: 'manually_approved',
    approved_by: auth.userId,
    approved_at: new Date().toISOString(),
    clock_in_method: 'manual',
    clock_out_method: 'manual',
    entry_type,
    timecard_source: 'manual',
    admin_notes: notes,
    notes,
    work_location: 'shop',
    is_shop_hours: false,
    is_night_shift: false,
    auto_lunch_applied: false,
    lunch_duration_minutes: 0,
    break_minutes: 0,
  };

  const { data, error } = await supabaseAdmin
    .from('timecards')
    .insert(insert)
    .select('*')
    .single();

  if (error) {
    console.error('manual timecard POST error:', error);
    return NextResponse.json({ error: 'Failed to create entry', details: error.message }, { status: 500 });
  }

  // PTO bookkeeping: increment operator_pto_balance.pto_days_used.
  // 1 day = 8 hours; we just add fractional days.
  if (entry_type === 'pto') {
    const year = parseInt(date.slice(0, 4), 10);
    const daysUsed = hours / 8;
    try {
      const { data: existing } = await supabaseAdmin
        .from('operator_pto_balance')
        .select('id, pto_days_used, pto_days_allocated')
        .eq('operator_id', user_id)
        .eq('year', year)
        .maybeSingle();
      if (existing) {
        await supabaseAdmin
          .from('operator_pto_balance')
          .update({ pto_days_used: Number(existing.pto_days_used || 0) + daysUsed })
          .eq('id', existing.id);
      } else {
        // Default 10 days allocated/year if no row yet (shop_manager could have a different policy later)
        await supabaseAdmin
          .from('operator_pto_balance')
          .insert({
            operator_id: user_id,
            tenant_id: auth.tenantId,
            year,
            pto_days_allocated: 10,
            pto_days_used: daysUsed,
          });
      }
    } catch (ptoErr) {
      // Don't roll back the timecard — PTO balance is a side-ledger.
      console.warn('PTO balance update failed (non-fatal):', ptoErr);
    }
  }

  // Audit log fire-and-forget
  Promise.resolve(
    supabaseAdmin.from('audit_logs').insert({
      action: 'admin_manual_timecard_entry',
      actor_id: auth.userId,
      resource_type: 'timecard',
      resource_id: data.id,
      details: { user_id, date, entry_type, hours, notes },
      tenant_id: auth.tenantId,
    })
  ).catch(() => {});

  return NextResponse.json({ success: true, data });
}
