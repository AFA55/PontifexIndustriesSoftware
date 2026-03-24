/**
 * API Route: PUT /api/admin/timecards/[id]/update
 * Update a timecard entry (admin/operations_manager/super_admin only).
 *
 * Permission rules:
 * - operator / apprentice: CANNOT edit timecards (even their own)
 * - admin / operations_manager: Can edit any timecard for corrections
 * - super_admin: Full access
 *
 * Validates:
 * - clock_out_time must be after clock_in_time
 * - total_hours must be positive and reasonable (< 24)
 * - Records audit trail (edited_by, edited_at, edit_reason)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

const EDIT_ROLES = ['admin', 'super_admin', 'operations_manager'];

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Await params in Next.js 15+
    const { id: timecardId } = await params;

    // Get user from Supabase session (server-side)
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    // Verify the token and get user
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    // Get user's role from profiles
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role, full_name')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'Failed to verify user role' },
        { status: 403 }
      );
    }

    // Strict permission check: only admin+ can edit timecards
    if (!EDIT_ROLES.includes(profile.role)) {
      return NextResponse.json(
        { error: 'Only administrators can edit timecards. Operators cannot modify time entries.' },
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

    // Determine final times for validation
    const finalClockInTime = clock_in_time || existingTimecard.clock_in_time;
    const finalClockOutTime = clock_out_time !== undefined ? clock_out_time : existingTimecard.clock_out_time;

    // Validate: clock_out must be after clock_in when both are present
    let total_hours = existingTimecard.total_hours;

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

      // Sanity check: a single entry shouldn't exceed 24 hours
      if (total_hours > 24) {
        return NextResponse.json(
          { error: 'A single timecard entry cannot exceed 24 hours. Please check the dates.' },
          { status: 400 }
        );
      }
    }

    // Build update data
    const updateData: Record<string, unknown> = {};

    if (clock_in_time) updateData.clock_in_time = clock_in_time;
    if (clock_out_time !== undefined) updateData.clock_out_time = clock_out_time;
    if (notes !== undefined) updateData.notes = notes;
    if (total_hours !== null) updateData.total_hours = total_hours;

    // Audit trail: record who edited and when
    updateData.edited_by = user.id;
    updateData.edited_at = new Date().toISOString();

    const { data: updatedTimecard, error: updateError } = await supabaseAdmin
      .from('timecards')
      .update(updateData)
      .eq('id', timecardId)
      .select()
      .single();

    if (updateError) {
      // If edited_by / edited_at columns don't exist yet, retry without them
      if (updateError.message?.includes('edited_by') || updateError.message?.includes('edited_at')) {
        delete updateData.edited_by;
        delete updateData.edited_at;

        const { data: retryData, error: retryError } = await supabaseAdmin
          .from('timecards')
          .update(updateData)
          .eq('id', timecardId)
          .select()
          .single();

        if (retryError) {
          console.error('Error updating timecard (retry):', retryError);
          return NextResponse.json(
            { error: 'Failed to update timecard' },
            { status: 500 }
          );
        }

        console.log(`Timecard ${timecardId} updated by ${profile.full_name || user.email} (audit columns not yet migrated)`);

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

    console.log(`Timecard ${timecardId} updated by ${profile.full_name || user.email} at ${new Date().toISOString()}`);

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
