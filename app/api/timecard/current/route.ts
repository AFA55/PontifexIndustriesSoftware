/**
 * API Route: GET /api/timecard/current
 * Get user's current active timecard (if clocked in)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, isTableNotFoundError } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    // Find active timecard (clocked in but not clocked out)
    const { data: activeTimecard, error: fetchError } = await supabaseAdmin
      .from('timecards')
      .select('*')
      .eq('user_id', auth.userId)
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
