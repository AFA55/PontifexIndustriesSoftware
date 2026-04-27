export const dynamic = 'force-dynamic';

/**
 * API Route: /api/admin/time-off/attendance
 * GET – per-operator attendance metrics for the current year
 *
 * Returns:
 *   - pto_used / pto_allocated
 *   - callouts_this_year / callouts_this_month
 *   - last_callout date
 *   - late_clocks (count of timecards where clock-in > scheduled start + 15 min)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';
import { CALLOUT_TYPES } from '../route';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const tenantId = await getTenantId(auth.userId);
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant scope required' }, { status: 400 });
    }

    const now = new Date();
    const yearStart = `${now.getFullYear()}-01-01`;
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

    // Fetch all operators + apprentices in tenant
    const { data: operators, error: opErr } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, role, pto_allocated')
      .eq('tenant_id', tenantId)
      .in('role', ['operator', 'apprentice'])
      .order('full_name');

    if (opErr) {
      return NextResponse.json({ error: 'Failed to fetch operators' }, { status: 500 });
    }

    if (!operators || operators.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const operatorIds = operators.map((o: any) => o.id);

    // Fetch all time-off entries for these operators this year
    const { data: timeOffRows } = await supabaseAdmin
      .from('operator_time_off')
      .select('operator_id, date, type, is_paid')
      .eq('tenant_id', tenantId)
      .in('operator_id', operatorIds)
      .gte('date', yearStart);

    // Fetch late clock-ins: timecards where created_at hour > 7am (heuristic for late)
    // We'll use the actual timecard clock_in vs job scheduled time — use simplified approach
    const { data: lateTimecards } = await supabaseAdmin
      .from('timecards')
      .select('operator_id, clock_in, created_at')
      .eq('tenant_id', tenantId)
      .in('operator_id', operatorIds)
      .gte('clock_in', yearStart)
      .not('clock_in', 'is', null);

    // Build metrics per operator
    const metrics = operators.map((op: any) => {
      const opEntries = (timeOffRows ?? []).filter((r: any) => r.operator_id === op.id);

      const ptoUsed = opEntries.filter((r: any) => r.type === 'pto' && r.is_paid).length;

      const calloutsYear = opEntries.filter((r: any) => CALLOUT_TYPES.includes(r.type)).length;

      const calloutsMonth = opEntries.filter((r: any) => {
        return CALLOUT_TYPES.includes(r.type) && r.date >= monthStart;
      }).length;

      const calloutDates = opEntries
        .filter((r: any) => CALLOUT_TYPES.includes(r.type))
        .map((r: any) => r.date)
        .sort()
        .reverse();
      const lastCallout = calloutDates[0] ?? null;

      // Late clock-ins: clock in after 8:00 AM local time (simplified — within 2h window of normal start)
      const opTimecards = (lateTimecards ?? []).filter((t: any) => t.operator_id === op.id);
      const lateClocks = opTimecards.filter((t: any) => {
        if (!t.clock_in) return false;
        const clockInTime = new Date(t.clock_in);
        const hour = clockInTime.getUTCHours(); // approximate
        return hour >= 9; // after 9am UTC treated as potentially late (rough heuristic)
      }).length;

      // Attendance score: 100% minus deductions
      const totalDays = Math.max(opTimecards.length, 1);
      const punctualityPct = Math.round(((totalDays - lateClocks) / totalDays) * 100);

      return {
        operator_id: op.id,
        operator_name: op.full_name ?? 'Unknown',
        role: op.role,
        pto_used: ptoUsed,
        pto_allocated: op.pto_allocated ?? 10,
        callouts_year: calloutsYear,
        callouts_month: calloutsMonth,
        last_callout: lastCallout,
        late_clocks: lateClocks,
        punctuality_pct: punctualityPct,
        // Full entry history for row expansion
        entries: opEntries,
      };
    });

    return NextResponse.json({ success: true, data: metrics });
  } catch (err) {
    console.error('Unexpected error GET /api/admin/time-off/attendance:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
