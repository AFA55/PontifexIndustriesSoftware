export const dynamic = 'force-dynamic';

/**
 * API Route: GET /api/timecard/current
 * Get user's current active timecard (if clocked in)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, isTableNotFoundError } from '@/lib/api-auth';
import { getTenantShopContext, DEFAULT_TENANT_TIMEZONE } from '@/lib/geolocation-server';
import { findUnfinishedTickets, type UnfinishedTicketJob, type ClockOutWarningType } from '@/lib/unfinished-tickets';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const todayStr = new Date().toISOString().split('T')[0];

    // Find active timecard for TODAY only (clocked in but not clocked out)
    const { data: activeTimecard, error: fetchError } = await supabaseAdmin
      .from('timecards')
      .select('*')
      .eq('user_id', auth.userId)
      .eq('date', todayStr)
      .is('clock_out_time', null)
      .order('clock_in_time', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      // If table doesn't exist yet, treat as not clocked in
      if (isTableNotFoundError(fetchError)) {
        return NextResponse.json(
          { success: true, isClockedIn: false, data: null },
          { status: 200 }
        );
      }
      console.error('Error fetching active timecard:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch timecard' },
        { status: 500 }
      );
    }

    if (!activeTimecard) {
      // Auto-close any stale open timecards from previous days
      const { data: staleTimecards } = await supabaseAdmin
        .from('timecards')
        .select('id, date, clock_in_time')
        .eq('user_id', auth.userId)
        .is('clock_out_time', null)
        .lt('date', todayStr);

      for (const stale of staleTimecards ?? []) {
        // Close at end of that day (23:59:59)
        const eod = `${stale.date}T23:59:59`;
        await supabaseAdmin
          .from('timecards')
          .update({ clock_out_time: eod, notes: 'Auto-closed: no clock-out recorded' })
          .eq('id', stale.id);
      }

      return NextResponse.json(
        {
          success: true,
          isClockedIn: false,
          data: null,
        },
        { status: 200 }
      );
    }

    // Calculate current working hours
    const now = new Date();
    const clockInTime = new Date(activeTimecard.clock_in_time);
    const milliseconds = now.getTime() - clockInTime.getTime();
    const currentHours = milliseconds / (1000 * 60 * 60);

    // Fetch linked job info if present
    let jobInfo: { job_number: string; customer_name: string } | null = null;
    if (activeTimecard.job_order_id) {
      const { data: job } = await supabaseAdmin
        .from('job_orders')
        .select('job_number, customer_name')
        .eq('id', activeTimecard.job_order_id)
        .maybeSingle();
      if (job) {
        jobInfo = { job_number: job.job_number, customer_name: job.customer_name };
      }
    }

    // Tenant shop coords for the native "back at shop → clock out?" geofence
    // reminder — plus the tenant timezone, from the SAME single `tenants` read
    // (this endpoint is polled every couple of minutes on native).
    let shop: { lat: number; lng: number } | null = null;
    let tenantTz = DEFAULT_TENANT_TIMEZONE;
    try {
      const ctx = await getTenantShopContext(supabaseAdmin, auth.tenantId ?? null);
      shop = { lat: ctx.coords.latitude, lng: ctx.coords.longitude };
      tenantTz = ctx.timezone;
    } catch { /* non-critical */ }

    // PRE-EMPTIVE nudge (founder Aug 2026: "before an operator clocks out,
    // remind them to fill out the ticket"). The clock-out 409 stays the
    // enforcement point; this rides along on a request the clock screens
    // ALREADY make (no new poll) so the reminder can be shown BEFORE the
    // Clock Out button is pressed. Same predicate as the gate — one source of
    // truth in lib/unfinished-tickets.ts. Best-effort: never fail the timecard.
    // Only field roles own tickets — skip the lookup entirely for everyone else
    // (findUnfinishedTickets returns null for them anyway).
    let unfinishedTickets: UnfinishedTicketJob[] = [];
    let unfinishedType: ClockOutWarningType | null = null;
    if (auth.role === 'operator' || auth.role === 'apprentice') {
      try {
        // Tenant-local calendar date (never toISOString — the recurring UTC
        // off-by-a-day bug); must match the date the clock-out gate uses.
        const localToday = new Date().toLocaleDateString('en-CA', { timeZone: tenantTz });
        const found = await findUnfinishedTickets({
          userId: auth.userId,
          role: auth.role,
          tenantId: auth.tenantId,
          today: localToday,
        });
        if (found && found.jobs.length > 0) {
          unfinishedTickets = found.jobs;
          unfinishedType = found.blockType;
        }
      } catch { /* non-critical — the 409 gate still catches it at clock-out */ }
    }

    return NextResponse.json(
      {
        success: true,
        isClockedIn: true,
        data: {
          id: activeTimecard.id,
          clockInTime: activeTimecard.clock_in_time,
          clockInLocation: {
            latitude: activeTimecard.clock_in_latitude,
            longitude: activeTimecard.clock_in_longitude,
            accuracy: activeTimecard.clock_in_accuracy,
          },
          currentHours: parseFloat(currentHours.toFixed(2)),
          date: activeTimecard.date,
          isShopHours: activeTimecard.is_shop_hours || false,
          isNightShift: activeTimecard.is_night_shift || false,
          hourType: activeTimecard.hour_type || 'regular',
          clockInMethod: activeTimecard.clock_in_method || 'gps',
          jobOrderId: activeTimecard.job_order_id || null,
          jobNumber: jobInfo?.job_number || null,
          jobCustomerName: jobInfo?.customer_name || null,
          outOfTown: activeTimecard.out_of_town || false,
          shop,
          // Today's unfinished tickets for THIS worker (operator/apprentice only;
          // empty for every other role). Drives the inline "finish your ticket"
          // hint next to Clock Out.
          unfinishedTickets,
          unfinishedType,
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Unexpected error in current timecard route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
