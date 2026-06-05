export const dynamic = 'force-dynamic';

/**
 * API Route: GET /api/admin/timecards/team-summary?weekStart=YYYY-MM-DD
 * Returns a team payroll overview for a given week.
 *
 * Response: {
 *   success: true,
 *   data: {
 *     teamMembers: [{
 *       userId, fullName, email, role,
 *       dailyHours: { Mon: { hours, status }, ... },
 *       weeklyTotal, regularHours, overtimeHours, breakMinutesTotal,
 *       pendingCount, approvedCount, totalEntries,
 *       isClockedIn, hasNoEntries,
 *       status: 'all_approved' | 'has_pending' | 'clocked_in' | 'no_entries'
 *     }],
 *     totals: {
 *       totalPayrollHours, totalRegularHours, totalOvertimeHours,
 *       totalBreakMinutes, pendingApprovals, activeClockins
 *     }
 *   }
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

function getMondayFromString(weekStart: string): Date {
  const d = new Date(weekStart + 'T00:00:00');
  return d;
}

function getSundayFromMonday(monday: Date): Date {
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  return sunday;
}

function getDayIndex(dateStr: string, mondayStr: string): number {
  const date = new Date(dateStr + 'T00:00:00');
  const monday = new Date(mondayStr + 'T00:00:00');
  const diff = Math.round((date.getTime() - monday.getTime()) / (1000 * 60 * 60 * 24));
  return diff; // 0=Mon, 1=Tue, ..., 6=Sun
}

interface DayInfo {
  hours: number;
  status: 'approved' | 'pending' | 'active' | 'mixed' | 'none';
  entryCount: number;
  isLate: boolean;
  lateMinutes: number;
  isNoShow: boolean;
  firstTimecardId: string | null;
  firstClockIn: string | null;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const tenantId = auth.tenantId;

    if (!tenantId) return NextResponse.json({ error: 'Tenant scope required. super_admin must pass ?tenantId=' }, { status: 400 });
    const searchParams = request.nextUrl.searchParams;
    const weekStartParam = searchParams.get('weekStart');

    if (!weekStartParam) {
      return NextResponse.json(
        { error: 'weekStart parameter is required (YYYY-MM-DD)' },
        { status: 400 }
      );
    }

    const monday = getMondayFromString(weekStartParam);
    const sunday = getSundayFromMonday(monday);
    const mondayStr = weekStartParam;
    const sundayStr = sunday.toISOString().split('T')[0];

    // 1. Fetch all team members (operators, apprentices, shop managers, etc.)
    let profilesQuery = supabaseAdmin
      .from('profiles')
      .select('id, full_name, email, role, active')
      .in('role', ['operator', 'apprentice', 'shop_manager', 'admin', 'operations_manager', 'supervisor'])
      .order('full_name', { ascending: true });

    profilesQuery = profilesQuery.eq('tenant_id', tenantId);

    const { data: profiles, error: profilesError } = await profilesQuery;

    if (profilesError) {
      console.error('Error fetching profiles:', profilesError);
      return NextResponse.json({ error: 'Failed to fetch team members' }, { status: 500 });
    }

    // 2. Fetch all timecards for this week
    let timecardsQuery = supabaseAdmin
      .from('timecards')
      .select('id, user_id, date, clock_in_time, clock_out_time, total_hours, is_approved, is_shop_hours, is_night_shift, hour_type, entry_type, break_minutes, notes, is_late, late_minutes')
      .gte('date', mondayStr)
      .lte('date', sundayStr)
      .order('date', { ascending: true });

    timecardsQuery = timecardsQuery.eq('tenant_id', tenantId);

    const { data: timecards, error: timecardsError } = await timecardsQuery;

    if (timecardsError) {
      // If timecards table doesn't exist yet, return empty
      if (timecardsError.message?.includes('does not exist') || timecardsError.code === '42P01') {
        return NextResponse.json({
          success: true,
          data: { teamMembers: [], totals: { totalPayrollHours: 0, totalRegularHours: 0, totalOvertimeHours: 0, totalBreakMinutes: 0, pendingApprovals: 0, activeClockins: 0 } }
        });
      }
      console.error('Error fetching timecards:', timecardsError);
      return NextResponse.json({ error: 'Failed to fetch timecards' }, { status: 500 });
    }

    // 2b. Fetch subsistence (per-diem) nights for this week + the tenant's rate.
    //     Subsistence is a flat per-night add, OT-EXEMPT — it never enters the
    //     hours/OT math below. We only count nights per operator and (if a rate
    //     is configured) derive pay = nights × rate. Fire-tolerant: a failure
    //     here must not break the payroll grid.
    let subsistenceRate = 0;
    const subsistenceNightsByUser: Record<string, number> = {};
    try {
      const { data: rateRow } = await supabaseAdmin
        .from('timecard_settings_v2')
        .select('subsistence_rate')
        .eq('tenant_id', tenantId)
        .limit(1)
        .maybeSingle();
      subsistenceRate = Number(rateRow?.subsistence_rate) || 0;

      const { data: nights } = await supabaseAdmin
        .from('subsistence_nights')
        .select('operator_id, night_date')
        .eq('tenant_id', tenantId)
        .gte('night_date', mondayStr)
        .lte('night_date', sundayStr);

      (nights || []).forEach((n: { operator_id: string }) => {
        subsistenceNightsByUser[n.operator_id] = (subsistenceNightsByUser[n.operator_id] || 0) + 1;
      });
    } catch {
      // Table may not exist yet (migration pending) — degrade to 0 nights / no pay.
    }

    // 3. Group timecards by user
    const tcByUser: Record<string, typeof timecards> = {};
    (timecards || []).forEach((tc) => {
      if (!tcByUser[tc.user_id]) tcByUser[tc.user_id] = [];
      tcByUser[tc.user_id].push(tc);
    });

    // 4. Build team member summaries
    let totalPayrollHours = 0;
    let totalRegularHours = 0;
    let totalOvertimeHours = 0;
    let totalBreakMinutes = 0;
    let pendingApprovals = 0;
    let activeClockins = 0;
    let lateArrivalsThisWeek = 0;

    const teamMembers = (profiles || [])
      .filter(p => p.active !== false) // exclude deactivated accounts
      .map((profile) => {
        const entries = tcByUser[profile.id] || [];

        // Build daily hours map
        const dailyHours: Record<string, DayInfo> = {};
        DAY_NAMES.forEach(day => {
          dailyHours[day] = { hours: 0, status: 'none', entryCount: 0, isLate: false, lateMinutes: 0, isNoShow: false, firstTimecardId: null, firstClockIn: null };
        });

        let weeklyTotal = 0;
        let breakMinutesTotal = 0;
        let pendingCount = 0;
        let approvedCount = 0;
        let isClockedIn = false;

        entries.forEach((tc) => {
          const dayIdx = getDayIndex(tc.date, mondayStr);
          if (dayIdx < 0 || dayIdx > 6) return; // out of range

          const dayName = DAY_NAMES[dayIdx];
          const hours = tc.total_hours || 0;

          dailyHours[dayName].hours += hours;
          dailyHours[dayName].entryCount += 1;

          // No-show: zero-hour record (entry_type='no_call_no_show'). Flag the day so
          // the grid renders a chip. Doesn't touch hours/OT math (no-show is 0 hours).
          if ((tc as any).entry_type === 'no_call_no_show') {
            dailyHours[dayName].isNoShow = true;
          }
          weeklyTotal += hours;
          breakMinutesTotal += tc.break_minutes || 0;

          // Track late arrival — use the first clock-in of the day
          if (dailyHours[dayName].firstTimecardId === null) {
            dailyHours[dayName].firstTimecardId = tc.id;
            dailyHours[dayName].firstClockIn = tc.clock_in_time || null;
          }
          if ((tc as any).is_late) {
            if (!dailyHours[dayName].isLate) {
              // Only count once per day per operator
              lateArrivalsThisWeek++;
            }
            dailyHours[dayName].isLate = true;
            dailyHours[dayName].lateMinutes = Math.max(dailyHours[dayName].lateMinutes, (tc as any).late_minutes || 0);
          }

          if (!tc.clock_out_time) {
            isClockedIn = true;
            dailyHours[dayName].status = 'active';
          } else if (tc.is_approved) {
            approvedCount++;
            if (dailyHours[dayName].status === 'none') {
              dailyHours[dayName].status = 'approved';
            } else if (dailyHours[dayName].status === 'pending') {
              dailyHours[dayName].status = 'mixed';
            }
          } else {
            pendingCount++;
            if (dailyHours[dayName].status === 'none') {
              dailyHours[dayName].status = 'pending';
            } else if (dailyHours[dayName].status === 'approved') {
              dailyHours[dayName].status = 'mixed';
            }
          }
        });

        // Calculate OT: weekday (non-mandatory) hours > 40 = weekly OT
        const weekdayHours = entries
          .filter(e => e.hour_type !== 'mandatory_overtime')
          .reduce((s, e) => s + (e.total_hours || 0), 0);
        const regularHours = Math.min(weekdayHours, 40);
        const overtimeHours = Math.max(0, weekdayHours - 40);
        const mandatoryOT = entries
          .filter(e => e.hour_type === 'mandatory_overtime')
          .reduce((s, e) => s + (e.total_hours || 0), 0);

        // Accumulate totals
        totalPayrollHours += weeklyTotal;
        totalRegularHours += regularHours;
        totalOvertimeHours += overtimeHours + mandatoryOT;
        totalBreakMinutes += breakMinutesTotal;
        pendingApprovals += pendingCount;
        if (isClockedIn) activeClockins++;

        const hasNoEntries = entries.length === 0;
        const status = isClockedIn
          ? 'clocked_in'
          : hasNoEntries
            ? 'no_entries'
            : pendingCount > 0
              ? 'has_pending'
              : 'all_approved';

        const weekendDaysWorked = (['Sat', 'Sun'] as const).filter(
          d => dailyHours[d].hours > 0
        ).length;

        // Subsistence: OT-exempt flat per-night count for this operator/week.
        const subsistenceNights = subsistenceNightsByUser[profile.id] || 0;

        return {
          userId: profile.id,
          fullName: profile.full_name || profile.email,
          email: profile.email,
          role: profile.role,
          dailyHours,
          weeklyTotal: parseFloat(weeklyTotal.toFixed(2)),
          regularHours: parseFloat(regularHours.toFixed(2)),
          overtimeHours: parseFloat((overtimeHours + mandatoryOT).toFixed(2)),
          breakMinutesTotal,
          pendingCount,
          approvedCount,
          totalEntries: entries.length,
          isClockedIn,
          hasNoEntries,
          status,
          weekendDaysWorked,
          subsistenceNights,
          // Only surface a dollar amount when the tenant has configured a rate.
          subsistencePay: subsistenceRate > 0
            ? parseFloat((subsistenceNights * subsistenceRate).toFixed(2))
            : null,
        };
      })
      // Sort: active first, then by hours descending, no_entries last
      .sort((a, b) => {
        if (a.status === 'clocked_in' && b.status !== 'clocked_in') return -1;
        if (b.status === 'clocked_in' && a.status !== 'clocked_in') return 1;
        if (a.hasNoEntries && !b.hasNoEntries) return 1;
        if (b.hasNoEntries && !a.hasNoEntries) return -1;
        return b.weeklyTotal - a.weeklyTotal;
      });

    const totalSubsistenceNights = teamMembers.reduce((s, m) => s + (m.subsistenceNights || 0), 0);

    return NextResponse.json({
      success: true,
      data: {
        teamMembers,
        subsistenceRate,
        totals: {
          totalPayrollHours: parseFloat(totalPayrollHours.toFixed(2)),
          totalRegularHours: parseFloat(totalRegularHours.toFixed(2)),
          totalOvertimeHours: parseFloat(totalOvertimeHours.toFixed(2)),
          totalBreakMinutes,
          pendingApprovals,
          activeClockins,
          lateArrivalsThisWeek,
          totalSubsistenceNights,
          // OT-exempt flat add; null while no rate is configured.
          totalSubsistencePay: subsistenceRate > 0
            ? parseFloat((totalSubsistenceNights * subsistenceRate).toFixed(2))
            : null,
        },
      },
    });
  } catch (error: unknown) {
    console.error('Unexpected error in team-summary route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
