export const dynamic = 'force-dynamic';

/**
 * API Route: PUT /api/admin/timecards/[id]/update
 * Update a timecard entry (admin/operations_manager/super_admin only).
 *
 * Validates:
 * - clock_out_time must be after clock_in_time
 * - total_hours must be positive and reasonable (< 24)
 * - Records audit trail (edited_by, edited_at)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id: timecardId } = await params;
    const tenantId = auth.tenantId;
    if (!tenantId) return NextResponse.json({ error: 'Tenant scope required. super_admin must pass ?tenantId=' }, { status: 400 });
    // Parse request body
    const body = await request.json();
    const { clock_in_time, clock_out_time, notes, is_shop_hours, hour_type } = body;

    // Check if timecard exists (scoped to tenant)
    let checkQuery = supabaseAdmin
      .from('timecards')
      .select('*')
      .eq('id', timecardId);
    checkQuery = checkQuery.eq('tenant_id', tenantId);
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

      // Sanity check
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
    if (typeof is_shop_hours === 'boolean') updateData.is_shop_hours = is_shop_hours;
    if (hour_type) updateData.hour_type = hour_type;

    // Audit trail
    updateData.edited_by = auth.userId;
    updateData.edited_at = new Date().toISOString();

    let updateQuery = supabaseAdmin
      .from('timecards')
      .update(updateData)
      .eq('id', timecardId);
    updateQuery = updateQuery.eq('tenant_id', tenantId);
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
        retryQuery = retryQuery.eq('tenant_id', tenantId);
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
