/**
 * API Route: PUT /api/admin/timecards/[id]/update
 * Update a timecard (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Await params in Next.js 15+
    const { id: timecardId } = await params;

    // Get user from Supabase session (server-side)
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    // Get user's role from profiles
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', auth.userId)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'Failed to verify user role' },
        { status: 403 }
      );
    }

    // Check if user is admin, super_admin, or operations_manager
    const adminRoles = ['admin', 'super_admin', 'operations_manager'];
    if (!adminRoles.includes(profile.role)) {
      return NextResponse.json(
        { error: 'Only administrators can update timecards' },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { clock_in_time, clock_out_time, notes } = body;

    // Check if timecard exists
    const { data: existingTimecard, error: checkError } = await supabaseAdmin
      .from('timecards')
      .select('*')
      .eq('id', timecardId)
      .single();

    if (checkError || !existingTimecard) {
      return NextResponse.json(
        { error: 'Timecard not found' },
        { status: 404 }
      );
    }

    // Calculate new total hours if both times are provided
    let total_hours = existingTimecard.total_hours;
    let finalClockInTime = clock_in_time || existingTimecard.clock_in_time;
    let finalClockOutTime = clock_out_time !== undefined ? clock_out_time : existingTimecard.clock_out_time;

    if (finalClockInTime && finalClockOutTime) {
      const clockIn = new Date(finalClockInTime);
      const clockOut = new Date(finalClockOutTime);
      const milliseconds = clockOut.getTime() - clockIn.getTime();
      total_hours = parseFloat((milliseconds / (1000 * 60 * 60)).toFixed(2));
    }

    // Update timecard
    const updateData: any = {};

    if (clock_in_time) updateData.clock_in_time = clock_in_time;
    if (clock_out_time !== undefined) updateData.clock_out_time = clock_out_time;
    if (notes !== undefined) updateData.notes = notes;
    if (total_hours !== null) updateData.total_hours = total_hours;

    const { data: updatedTimecard, error: updateError } = await supabaseAdmin
      .from('timecards')
      .update(updateData)
      .eq('id', timecardId)
      .select()
      .single();

    if (updateError) {
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
  } catch (error: any) {
    console.error('Unexpected error in timecard update route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
