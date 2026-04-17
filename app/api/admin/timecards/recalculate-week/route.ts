export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/timecards/recalculate-week
 * Body: { userId: string, weekStart: string }
 * Auth: requireAdmin
 *
 * Processes all timecards for a user in the week (Mon-Sun) ordered by date+clock_in_time ASC.
 * For each entry without a pay_type_override:
 *   - Tracks running weekly total hours
 *   - If is_night_shift: applies 40hr crossover (night_shift_premium → OT)
 *   - Else: applies standard weekly OT crossover
 * Batch-updates all affected entries.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

interface TimecardRow {
  id: string;
  user_id: string;
  date: string;
  clock_in_time: string;
  clock_out_time: string | null;
  total_hours: number | null;
  is_night_shift: boolean;
  pay_type_override: string | null;
  regular_hours: number | null;
  overtime_hours: number | null;
  double_time_hours: number | null;
  night_shift_premium_hours: number | null;
  hour_type: string;
  labor_cost: number | null;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const tenantId = auth.tenantId;
    const body = await request.json();
    const { userId, weekStart } = body as { userId: string; weekStart: string };

    if (!userId || !weekStart) {
      return NextResponse.json({ error: 'userId and weekStart are required' }, { status: 400 });
    }

    // Validate weekStart format
    const weekStartDate = new Date(weekStart + 'T00:00:00');
    if (isNaN(weekStartDate.getTime())) {
      return NextResponse.json({ error: 'Invalid weekStart date' }, { status: 400 });
    }

    const weekEnd = new Date(weekStartDate);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekEndStr = weekEnd.toISOString().split('T')[0];

    // Fetch timecard settings
    let settingsQ = supabaseAdmin
      .from('timecard_settings_v2')
      .select('overtime_multiplier, double_time_multiplier, weekly_ot_threshold_hours, night_shift_multiplier')
      .limit(1);
    if (tenantId) settingsQ = settingsQ.eq('tenant_id', tenantId);
    const { data: settingsData } = await settingsQ.single();

    const settings = {
      overtime_multiplier: (settingsData?.overtime_multiplier as number) ?? 1.5,
      double_time_multiplier: (settingsData?.double_time_multiplier as number) ?? 2.0,
      weekly_ot_threshold_hours: (settingsData?.weekly_ot_threshold_hours as number) ?? 40.0,
      night_shift_multiplier: (settingsData?.night_shift_multiplier as number) ?? 1.25,
    };

    // Fetch all timecards for user in the week ordered by date + clock_in_time
    let q = supabaseAdmin
      .from('timecards')
      .select('id, user_id, date, clock_in_time, clock_out_time, total_hours, is_night_shift, pay_type_override, regular_hours, overtime_hours, double_time_hours, night_shift_premium_hours, hour_type, labor_cost')
      .eq('user_id', userId)
      .gte('date', weekStart)
      .lte('date', weekEndStr)
      .order('date', { ascending: true })
      .order('clock_in_time', { ascending: true });

    if (tenantId) q = q.eq('tenant_id', tenantId);

    const { data: entries, error: fetchError } = await q;
    if (fetchError) {
      console.error('Error fetching entries for recalculation:', fetchError);
      return NextResponse.json({ error: 'Failed to fetch timecard entries' }, { status: 500 });
    }

    if (!entries || entries.length === 0) {
      return NextResponse.json({ success: true, updated: 0, entries: [] });
    }

    // Process each entry in chronological order
    let runningHours = 0;
    const updates: Array<{ id: string; data: Record<string, unknown> }> = [];

    for (const entry of entries as TimecardRow[]) {
      const totalHours = Number(entry.total_hours) || 0;

      if (!totalHours || !entry.clock_in_time || !entry.clock_out_time) {
        // No complete entry — just add to running total and skip recalc
        runningHours += totalHours;
        continue;
      }

      if (entry.pay_type_override) {
        // Override is set — don't touch this entry's hour breakdown, just count toward weekly total
        runningHours += totalHours;
        continue;
      }

      const hoursUntil40 = Math.max(0, settings.weekly_ot_threshold_hours - runningHours);
      const updateData: Record<string, unknown> = {};

      if (entry.is_night_shift) {
        const nightShiftPremiumHours = Math.min(totalHours, hoursUntil40);
        const otOverflow = Math.max(0, totalHours - hoursUntil40);

        if (nightShiftPremiumHours > 0 && otOverflow === 0) {
          updateData.night_shift_premium_hours = nightShiftPremiumHours;
          updateData.overtime_hours = 0;
          updateData.regular_hours = 0;
          updateData.double_time_hours = 0;
          updateData.hour_type = 'night_shift';
        } else if (nightShiftPremiumHours > 0 && otOverflow > 0) {
          updateData.night_shift_premium_hours = nightShiftPremiumHours;
          updateData.overtime_hours = otOverflow;
          updateData.regular_hours = 0;
          updateData.double_time_hours = 0;
          updateData.hour_type = 'night_shift';
        } else {
          // All hours are past the 40hr threshold
          updateData.night_shift_premium_hours = 0;
          updateData.overtime_hours = totalHours;
          updateData.regular_hours = 0;
          updateData.double_time_hours = 0;
          updateData.hour_type = 'regular';
        }

        // Recalculate labor_cost if we have a base rate
        const laborCost = Number(entry.labor_cost) || 0;
        const oldTotal = Number(entry.total_hours) || 0;
        if (laborCost > 0 && oldTotal > 0) {
          const baseRate = laborCost / oldTotal;
          const nsHours = Number(updateData.night_shift_premium_hours) || 0;
          const otHours = Number(updateData.overtime_hours) || 0;
          updateData.labor_cost = parseFloat(
            (nsHours * baseRate * settings.night_shift_multiplier +
             otHours * baseRate * settings.overtime_multiplier).toFixed(2)
          );
        }
      } else {
        // Standard (non-night-shift) weekly OT crossover
        if (hoursUntil40 <= 0) {
          updateData.regular_hours = 0;
          updateData.overtime_hours = totalHours;
          updateData.night_shift_premium_hours = 0;
          updateData.double_time_hours = 0;
          updateData.hour_type = 'regular';
        } else if (totalHours > hoursUntil40) {
          updateData.regular_hours = hoursUntil40;
          updateData.overtime_hours = totalHours - hoursUntil40;
          updateData.night_shift_premium_hours = 0;
          updateData.double_time_hours = 0;
          updateData.hour_type = 'regular';
        } else {
          updateData.regular_hours = totalHours;
          updateData.overtime_hours = 0;
          updateData.night_shift_premium_hours = 0;
          updateData.double_time_hours = 0;
          // Keep existing hour_type if it's mandatory_overtime
          if (entry.hour_type !== 'mandatory_overtime') {
            updateData.hour_type = 'regular';
          }
        }
      }

      updates.push({ id: entry.id, data: updateData });
      runningHours += totalHours;
    }

    // Batch update
    const updatePromises = updates.map(({ id, data }) => {
      let uq = supabaseAdmin.from('timecards').update(data).eq('id', id);
      if (tenantId) uq = uq.eq('tenant_id', tenantId);
      return uq;
    });

    await Promise.all(updatePromises);

    return NextResponse.json({
      success: true,
      updated: updates.length,
      weeklyTotal: runningHours,
      entries: updates.map(u => ({ id: u.id, ...u.data })),
    });
  } catch (error: unknown) {
    console.error('Unexpected error in recalculate-week route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
