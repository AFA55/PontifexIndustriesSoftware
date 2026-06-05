export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/company-holidays/[id]/apply
 *
 * Idempotent, re-runnable. For the given holiday, resolve eligible employees by
 * ROLE (per the holiday's `applies_to` scope) and insert a holiday-pay timecard
 * row for each — but only if no holiday row already exists for that (user, date).
 *
 * Eligibility (hourly field + shop staff only; office/salaried never auto-get holiday pay):
 *   all   → operator, apprentice, shop_manager, shop_help
 *   field → operator, apprentice
 *   shop  → shop_manager, shop_help
 *
 * The inserted row mirrors the admin manual-entry shape (entry_type='holiday',
 * total/gross/net/regular = pay_hours, is_approved, manually_approved, manual
 * source). Holiday hours are OT-exempt in calculateWeekSummary.
 *
 * Idempotency: the partial unique index `timecards_one_holiday_per_day` on
 * (user_id, date) WHERE entry_type='holiday' makes a re-apply a no-op. We also
 * pre-filter against existing holiday rows so re-runs return accurate skip counts.
 *
 * Returns { success, applied: N, skipped: M }.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

// Role → eligibility set. These are the hourly field + shop staff.
const FIELD_ROLES = ['operator', 'apprentice'];
const SHOP_ROLES = ['shop_manager', 'shop_help'];
const APPLIES_TO_ROLES: Record<string, string[]> = {
  all: [...FIELD_ROLES, ...SHOP_ROLES],
  field: [...FIELD_ROLES],
  shop: [...SHOP_ROLES],
};

const SHOP_ROLE_SET = new Set(SHOP_ROLES);

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;
  if (!auth.tenantId) return NextResponse.json({ error: 'Tenant required' }, { status: 400 });

  const { id } = await params;

  // 1. Load the holiday (tenant-scoped).
  const { data: holiday, error: hErr } = await supabaseAdmin
    .from('company_holidays')
    .select('id, tenant_id, holiday_date, name, pay_hours, applies_to, is_active')
    .eq('id', id)
    .maybeSingle();
  if (hErr || !holiday) return NextResponse.json({ error: 'Holiday not found' }, { status: 404 });
  if (auth.role !== 'super_admin' && holiday.tenant_id !== auth.tenantId) {
    return NextResponse.json({ error: 'Holiday not in your tenant' }, { status: 403 });
  }
  // Don't apply pay for a deactivated holiday (the UI disables the button, but the
  // API is directly callable — guard server-side too).
  if (holiday.is_active === false) {
    return NextResponse.json({ error: 'Holiday is inactive — reactivate it before applying pay.' }, { status: 400 });
  }

  const tenantId = holiday.tenant_id as string;
  const holidayDate = holiday.holiday_date as string; // bare YYYY-MM-DD
  const payHours = Number(holiday.pay_hours ?? 8);
  const roleSet = APPLIES_TO_ROLES[holiday.applies_to as string] ?? APPLIES_TO_ROLES.all;

  // 2. Resolve eligible employees: tenant + role membership.
  const { data: eligible, error: pErr } = await supabaseAdmin
    .from('profiles')
    .select('id, role')
    .eq('tenant_id', tenantId)
    .in('role', roleSet);
  if (pErr) {
    console.error('company-holidays apply — profiles error:', pErr);
    return NextResponse.json({ error: 'Failed to resolve eligible employees', details: pErr.message }, { status: 500 });
  }

  const eligibleUsers = eligible ?? [];
  if (eligibleUsers.length === 0) {
    return NextResponse.json({ success: true, applied: 0, skipped: 0 });
  }

  // 3. Find which eligible users already have a holiday row for this date (skip them).
  const userIds = eligibleUsers.map((u) => u.id);
  const { data: existing, error: exErr } = await supabaseAdmin
    .from('timecards')
    .select('user_id')
    .eq('date', holidayDate)
    .eq('entry_type', 'holiday')
    .in('user_id', userIds);
  if (exErr) {
    console.error('company-holidays apply — existing-rows error:', exErr);
    return NextResponse.json({ error: 'Failed to check existing entries', details: exErr.message }, { status: 500 });
  }
  const alreadyHas = new Set((existing ?? []).map((r) => r.user_id));

  // Build clock_in/out as LOCAL time (matches manual/route.ts; no UTC 'Z' literal).
  const clockInIso = new Date(`${holidayDate}T08:00:00`).toISOString();
  const clockOutIso = new Date(new Date(clockInIso).getTime() + payHours * 3_600_000).toISOString();
  const roundedHours = parseFloat(payHours.toFixed(2));
  const nowIso = new Date().toISOString();

  const rows = eligibleUsers
    .filter((u) => !alreadyHas.has(u.id))
    .map((u) => ({
      user_id: u.id,
      tenant_id: tenantId,
      date: holidayDate,
      clock_in_time: clockInIso,
      clock_out_time: clockOutIso,
      total_hours: roundedHours,
      gross_hours: roundedHours,
      net_hours: roundedHours,
      regular_hours: roundedHours,
      is_approved: true,
      approval_status: 'manually_approved',
      approved_by: auth.userId,
      approved_at: nowIso,
      clock_in_method: 'manual',
      clock_out_method: 'manual',
      entry_type: 'holiday',
      hour_type: 'regular',
      timecard_source: 'manual',
      admin_notes: `Holiday: ${holiday.name}`,
      notes: `Holiday: ${holiday.name}`,
      work_location: SHOP_ROLE_SET.has(u.role ?? '') ? 'shop' : 'field',
      is_shop_hours: false,
      is_night_shift: false,
      auto_lunch_applied: false,
      lunch_duration_minutes: 0,
      break_minutes: 0,
    }));

  const skipped = eligibleUsers.length - rows.length;
  let applied = 0;

  if (rows.length > 0) {
    // Insert the new holiday rows. The pre-filter above skips users who already
    // have a holiday row for this date, and the partial unique index
    // `timecards_one_holiday_per_day` is the hard safety net against any race.
    const { data: inserted, error: insErr } = await supabaseAdmin
      .from('timecards')
      .insert(rows)
      .select('id');
    if (insErr) {
      console.error('company-holidays apply — insert error:', insErr);
      return NextResponse.json({ error: 'Failed to apply holiday pay', details: insErr.message }, { status: 500 });
    }
    applied = (inserted ?? []).length;
  }

  // Audit log fire-and-forget (mirrors manual/route.ts).
  Promise.resolve(
    supabaseAdmin.from('audit_logs').insert({
      action: 'admin_apply_holiday_pay',
      actor_id: auth.userId,
      resource_type: 'company_holiday',
      resource_id: holiday.id,
      details: {
        holiday_date: holidayDate,
        name: holiday.name,
        pay_hours: payHours,
        applies_to: holiday.applies_to,
        applied,
        skipped,
      },
      tenant_id: tenantId,
    })
  ).catch(() => {});

  return NextResponse.json({ success: true, applied, skipped });
}
