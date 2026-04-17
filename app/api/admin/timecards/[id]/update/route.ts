export const dynamic = 'force-dynamic';

/**
 * API Route: PUT /api/admin/timecards/[id]/update
 * Update a timecard entry (admin/operations_manager/super_admin only).
 *
 * Supports:
 * - clock_in_time, clock_out_time, notes, is_shop_hours, hour_type
 * - pay_type_override: manual lock to a specific pay type (null = auto)
 * - is_night_shift: toggle night shift flag
 * - Applies weekly 40hr OT crossover when is_night_shift (or pay_type_override = 'night_shift_premium')
 * - Recalculates labor_cost using correct multiplier from timecard_settings_v2
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

// Fetch timecard settings for a tenant (night_shift_multiplier, weekly_ot_threshold_hours, etc.)
async function fetchSettings(tenantId: string | null) {
  let q = supabaseAdmin
    .from('timecard_settings_v2')
    .select('overtime_multiplier, double_time_multiplier, weekly_ot_threshold_hours, night_shift_multiplier')
    .limit(1);
  if (tenantId) q = q.eq('tenant_id', tenantId);
  const { data } = await q.single();
  return {
    overtime_multiplier: (data?.overtime_multiplier as number) ?? 1.5,
    double_time_multiplier: (data?.double_time_multiplier as number) ?? 2.0,
    weekly_ot_threshold_hours: (data?.weekly_ot_threshold_hours as number) ?? 40.0,
    night_shift_multiplier: (data?.night_shift_multiplier as number) ?? 1.25,
  };
}

// Get sum of total_hours for all OTHER timecards for a user in the same Mon-Sun week, before this entry (ordered by date+clock_in_time)
async function getWeekHoursBefore(
  userId: string,
  tenantId: string | null,
  entryId: string,
  entryDate: string,
  clockInTime: string
): Promise<number> {
  // Calculate Mon-Sun bounds for entryDate
  const date = new Date(entryDate + 'T00:00:00');
  const dayOfWeek = date.getDay(); // 0=Sun,1=Mon,...6=Sat
  const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(date);
  monday.setDate(monday.getDate() - diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);

  const weekStart = monday.toISOString().split('T')[0];
  const weekEnd = sunday.toISOString().split('T')[0];

  let q = supabaseAdmin
    .from('timecards')
    .select('id, date, clock_in_time, total_hours')
    .eq('user_id', userId)
    .neq('id', entryId)
    .gte('date', weekStart)
    .lte('date', weekEnd)
    .not('total_hours', 'is', null);

  if (tenantId) q = q.eq('tenant_id', tenantId);

  const { data: weekEntries } = await q;
  if (!weekEntries) return 0;

  // Sum entries that come before this one (earlier date, or same date with earlier clock_in)
  let runningHours = 0;
  for (const e of weekEntries) {
    if (e.date < entryDate) {
      runningHours += Number(e.total_hours) || 0;
    } else if (e.date === entryDate && e.clock_in_time < clockInTime) {
      runningHours += Number(e.total_hours) || 0;
    }
  }
  return runningHours;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id: timecardId } = await params;
    const tenantId = auth.tenantId;

    // Parse request body
    const body = await request.json();
    const {
      clock_in_time,
      clock_out_time,
      notes,
      is_shop_hours,
      hour_type,
      pay_type_override,
      is_night_shift: isNightShiftOverride,
    } = body;

    // Check if timecard exists (scoped to tenant)
    let checkQuery = supabaseAdmin
      .from('timecards')
      .select('*')
      .eq('id', timecardId);
    if (tenantId) {
      checkQuery = checkQuery.eq('tenant_id', tenantId);
    }
    const { data: existingTimecard, error: checkError } = await checkQuery.single();

    if (checkError || !existingTimecard) {
      return NextResponse.json(
        { error: 'Timecard not found' },
        { status: 404 }
      );
    }

    // Determine final times for validation
    const finalClockInTime = clock_in_time || existingTimecard.clock_in_time;
    const finalClockOutTime = clock_out_time !== undefined ? clock_out_time : existingTimecard.clock_out_time;

    // Validate: clock_out must be after clock_in when both are present
    let total_hours = existingTimecard.total_hours as number;

    if (finalClockInTime && finalClockOutTime) {
      const clockIn = new Date(finalClockInTime);
      const clockOut = new Date(finalClockOutTime);

      if (isNaN(clockIn.getTime()) || isNaN(clockOut.getTime())) {
        return NextResponse.json(
          { error: 'Invalid date format for clock-in or clock-out time.' },
          { status: 400 }
        );
      }

      const milliseconds = clockOut.getTime() - clockIn.getTime();

      if (milliseconds <= 0) {
        return NextResponse.json(
          { error: 'Clock-out time must be after clock-in time.' },
          { status: 400 }
        );
      }

      total_hours = parseFloat((milliseconds / (1000 * 60 * 60)).toFixed(2));

      // Sanity check
      if (total_hours > 24) {
        return NextResponse.json(
          { error: 'A single timecard entry cannot exceed 24 hours. Please check the dates.' },
          { status: 400 }
        );
      }
    }

    // Determine effective is_night_shift
    const effectiveIsNightShift =
      typeof isNightShiftOverride === 'boolean'
        ? isNightShiftOverride
        : (existingTimecard.is_night_shift as boolean);

    // Determine effective pay_type_override (null means "Auto")
    // pay_type_override in body: undefined = no change, null = clear override, string = set override
    const effectivePayTypeOverride =
      pay_type_override !== undefined
        ? pay_type_override
        : (existingTimecard.pay_type_override as string | null);

    // ── Night shift / weekly OT crossover logic ─────────────────────────────
    let night_shift_premium_hours = Number(existingTimecard.night_shift_premium_hours) || 0;
    let overtime_hours = Number(existingTimecard.overtime_hours) || 0;
    let double_time_hours = Number(existingTimecard.double_time_hours) || 0;
    let regular_hours = Number(existingTimecard.regular_hours) || 0;
    let labor_cost: number | null = existingTimecard.labor_cost as number | null;
    let effective_hour_type: string = hour_type || existingTimecard.hour_type || 'regular';

    // Only recalculate if we have a complete clock-in/out and the override isn't locking pay type
    const shouldRecalculate =
      finalClockInTime &&
      finalClockOutTime &&
      !effectivePayTypeOverride; // if override is set, don't touch hour breakdown

    if (shouldRecalculate && total_hours > 0) {
      const settings = await fetchSettings(tenantId ?? null);

      // Get hours accumulated in this week BEFORE this entry
      const weekHoursBefore = await getWeekHoursBefore(
        existingTimecard.user_id as string,
        tenantId ?? null,
        timecardId,
        existingTimecard.date as string,
        finalClockInTime
      );

      if (effectiveIsNightShift || effectivePayTypeOverride === 'night_shift_premium') {
        // Night shift: check if 40hr threshold has already been hit
        const hoursUntil40 = Math.max(0, settings.weekly_ot_threshold_hours - weekHoursBefore);
        night_shift_premium_hours = Math.min(total_hours, hoursUntil40);
        const otOverflow = Math.max(0, total_hours - hoursUntil40);

        if (night_shift_premium_hours > 0 && otOverflow === 0) {
          effective_hour_type = 'night_shift';
          overtime_hours = 0;
          regular_hours = 0;
          double_time_hours = 0;
        } else if (night_shift_premium_hours > 0 && otOverflow > 0) {
          // Partially night shift, rest is OT
          effective_hour_type = 'night_shift'; // primary type; badge will show "Night Shift → OT"
          overtime_hours = otOverflow;
          regular_hours = 0;
          double_time_hours = 0;
        } else {
          // All hours are past the 40hr threshold — pure OT
          effective_hour_type = 'regular'; // becomes weekly OT
          night_shift_premium_hours = 0;
          overtime_hours = total_hours;
          regular_hours = 0;
          double_time_hours = 0;
        }

        // Calculate labor_cost
        const hourlyRate = (existingTimecard.labor_cost && total_hours > 0)
          ? (existingTimecard.labor_cost as number) / total_hours // approximate, will be recalced properly
          : null;

        if (hourlyRate) {
          labor_cost =
            night_shift_premium_hours * hourlyRate * settings.night_shift_multiplier +
            overtime_hours * hourlyRate * settings.overtime_multiplier +
            double_time_hours * hourlyRate * settings.double_time_multiplier;
        }
      } else {
        // Standard (non-night-shift) — daily OT logic: leave regular/overtime/double_time as existing
        // but if total_hours changed, recalculate proportionally
        regular_hours = total_hours; // simple default if not already broken down
        night_shift_premium_hours = 0;
        overtime_hours = 0;
        double_time_hours = 0;

        // If weekHoursBefore already at/over threshold, it's weekly OT
        const hoursUntil40 = Math.max(0, settings.weekly_ot_threshold_hours - weekHoursBefore);
        if (hoursUntil40 <= 0) {
          regular_hours = 0;
          overtime_hours = total_hours;
          effective_hour_type = 'regular'; // will be shown as weekly OT via hours
        } else if (total_hours > hoursUntil40) {
          regular_hours = hoursUntil40;
          overtime_hours = total_hours - hoursUntil40;
        } else {
          regular_hours = total_hours;
          overtime_hours = 0;
        }
      }
    }

    // If pay_type_override is explicitly set, override labor_cost multiplier at read time
    // (labor_cost recalc when override is set but we have rate)
    if (effectivePayTypeOverride && total_hours > 0) {
      const settings = await fetchSettings(tenantId ?? null);
      // Try to get base hourly rate from existing labor_cost and old total_hours
      const oldTotalHours = Number(existingTimecard.total_hours) || 0;
      const oldLaborCost = Number(existingTimecard.labor_cost) || 0;
      if (oldTotalHours > 0 && oldLaborCost > 0) {
        const baseRate = oldLaborCost / oldTotalHours;
        const multipliers: Record<string, number> = {
          regular: 1.0,
          night_shift_premium: settings.night_shift_multiplier,
          overtime: settings.overtime_multiplier,
          double_time: settings.double_time_multiplier,
          mandatory_overtime: settings.overtime_multiplier,
        };
        const mult = multipliers[effectivePayTypeOverride] ?? 1.0;
        labor_cost = parseFloat((total_hours * baseRate * mult).toFixed(2));
      }
    }

    // Build update data
    const updateData: Record<string, unknown> = {};

    if (clock_in_time) updateData.clock_in_time = clock_in_time;
    if (clock_out_time !== undefined) updateData.clock_out_time = clock_out_time;
    if (notes !== undefined) updateData.notes = notes;
    if (total_hours !== null) updateData.total_hours = total_hours;
    if (typeof is_shop_hours === 'boolean') updateData.is_shop_hours = is_shop_hours;

    // hour_type: use recalculated value if we did recalc, else use body value if provided
    if (shouldRecalculate) {
      updateData.hour_type = effective_hour_type;
    } else if (hour_type) {
      updateData.hour_type = hour_type;
    }

    // Night shift fields
    if (typeof isNightShiftOverride === 'boolean') {
      updateData.is_night_shift = isNightShiftOverride;
    }

    // Pay type override (null = clear)
    if (pay_type_override !== undefined) {
      updateData.pay_type_override = pay_type_override;
    }

    // Hours breakdown (only update if recalculated)
    if (shouldRecalculate) {
      updateData.regular_hours = regular_hours;
      updateData.overtime_hours = overtime_hours;
      updateData.double_time_hours = double_time_hours;
      updateData.night_shift_premium_hours = night_shift_premium_hours;
    }

    // Labor cost (if recalculated)
    if (labor_cost !== null && labor_cost !== undefined) {
      updateData.labor_cost = labor_cost;
    }

    // Audit trail
    updateData.edited_by = auth.userId;
    updateData.edited_at = new Date().toISOString();

    let updateQuery = supabaseAdmin
      .from('timecards')
      .update(updateData)
      .eq('id', timecardId);
    if (tenantId) {
      updateQuery = updateQuery.eq('tenant_id', tenantId);
    }
    const { data: updatedTimecard, error: updateError } = await updateQuery
      .select()
      .single();

    if (updateError) {
      // If edited_by / edited_at columns don't exist yet, retry without them
      if (updateError.message?.includes('edited_by') || updateError.message?.includes('edited_at')) {
        delete updateData.edited_by;
        delete updateData.edited_at;

        let retryQuery = supabaseAdmin
          .from('timecards')
          .update(updateData)
          .eq('id', timecardId);
        if (tenantId) {
          retryQuery = retryQuery.eq('tenant_id', tenantId);
        }
        const { data: retryData, error: retryError } = await retryQuery
          .select()
          .single();

        if (retryError) {
          console.error('Error updating timecard (retry):', retryError);
          return NextResponse.json(
            { error: 'Failed to update timecard' },
            { status: 500 }
          );
        }

        return NextResponse.json(
          {
            success: true,
            message: 'Timecard updated successfully',
            data: retryData,
          },
          { status: 200 }
        );
      }

      console.error('Error updating timecard:', updateError);
      return NextResponse.json(
        { error: 'Failed to update timecard' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Timecard updated successfully',
        data: updatedTimecard,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error('Unexpected error in timecard update route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
