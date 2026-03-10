/**
 * GET /api/admin/schedule-board/capacity
 * Check schedule capacity for a date or date range.
 * Returns job counts per date so the frontend can determine availability.
 *
 * Query params:
 *   date - single date (YYYY-MM-DD)
 *   startDate + endDate - date range (multi-day job validation)
 *   findNext=true&from=YYYY-MM-DD - find next available date below warning threshold
 *
 * Access: admin, super_admin, salesman
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireScheduleBoardAccess } from '@/lib/api-auth';

const DEFAULT_MAX_SLOTS = 10;
const DEFAULT_WARNING_THRESHOLD = 8;

async function getCapacitySettings() {
  try {
    const { data } = await supabaseAdmin
      .from('schedule_settings')
      .select('setting_value')
      .eq('setting_key', 'capacity')
      .single();
    return {
      maxSlots: data?.setting_value?.max_slots ?? DEFAULT_MAX_SLOTS,
      warningThreshold: data?.setting_value?.warning_threshold ?? DEFAULT_WARNING_THRESHOLD,
    };
  } catch {
    return { maxSlots: DEFAULT_MAX_SLOTS, warningThreshold: DEFAULT_WARNING_THRESHOLD };
  }
}

async function countJobsOnDate(dateStr: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from('job_orders')
    .select('*', { count: 'exact', head: true })
    .eq('scheduled_date', dateStr)
    .not('status', 'in', '("pending_approval","cancelled")')
    .eq('is_will_call', false)
    .is('deleted_at', null);
  return count || 0;
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireScheduleBoardAccess(request);
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(request.url);
    const singleDate = searchParams.get('date');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const findNext = searchParams.get('findNext') === 'true';
    const fromDate = searchParams.get('from');

    const { maxSlots, warningThreshold } = await getCapacitySettings();

    // ── Find Next Available Date ──
    if (findNext) {
      const start = fromDate || new Date().toISOString().split('T')[0];
      for (let i = 0; i < 90; i++) {
        const d = new Date(start + 'T12:00:00');
        d.setDate(d.getDate() + i);
        if (d.getDay() === 0 || d.getDay() === 6) continue;

        const dateStr = toDateStr(d);
        const jobCount = await countJobsOnDate(dateStr);

        if (jobCount < warningThreshold) {
          return NextResponse.json({
            success: true,
            data: {
              nextAvailableDate: dateStr,
              jobCount,
              maxSlots,
              warningThreshold,
              availableSlots: maxSlots - jobCount,
            },
          });
        }
      }

      return NextResponse.json({
        success: true,
        data: { nextAvailableDate: null, message: 'No available date found in the next 90 days', maxSlots, warningThreshold },
      });
    }

    // ── Single date ──
    if (singleDate) {
      const jobCount = await countJobsOnDate(singleDate);
      return NextResponse.json({
        success: true,
        data: {
          [singleDate]: {
            jobCount, maxSlots, warningThreshold,
            availableSlots: maxSlots - jobCount,
            isFull: jobCount >= maxSlots,
            isWarning: jobCount >= warningThreshold,
          },
        },
      });
    }

    // ── Date range (for multi-day job validation) ──
    if (startDate && endDate) {
      const start = new Date(startDate + 'T12:00:00');
      const end = new Date(endDate + 'T12:00:00');
      const capacityMap: Record<string, {
        jobCount: number; maxSlots: number; warningThreshold: number;
        availableSlots: number; isFull: boolean; isWarning: boolean;
      }> = {};

      const current = new Date(start);
      while (current <= end) {
        if (current.getDay() !== 0 && current.getDay() !== 6) {
          const dateStr = toDateStr(current);
          const jobCount = await countJobsOnDate(dateStr);
          capacityMap[dateStr] = {
            jobCount, maxSlots, warningThreshold,
            availableSlots: maxSlots - jobCount,
            isFull: jobCount >= maxSlots,
            isWarning: jobCount >= warningThreshold,
          };
        }
        current.setDate(current.getDate() + 1);
      }

      const dates = Object.keys(capacityMap).sort();
      const fullDates = dates.filter(d => capacityMap[d].isFull);
      const warningDates = dates.filter(d => capacityMap[d].isWarning && !capacityMap[d].isFull);

      return NextResponse.json({
        success: true,
        data: capacityMap,
        summary: {
          totalDays: dates.length,
          fullDates,
          warningDates,
          hasContinuousAvailability: fullDates.length === 0,
          maxSlots,
          warningThreshold,
        },
      });
    }

    return NextResponse.json({ error: 'Provide date, startDate+endDate, or findNext=true' }, { status: 400 });
  } catch (error) {
    console.error('Error in capacity check:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
