/**
 * API Route: PATCH /api/admin/job-orders/[id]
 * Update a job order (admin only)
 *
 * API Route: DELETE /api/admin/job-orders/[id]
 * Delete a job order (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin, isTableNotFoundError } from '@/lib/api-auth';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Await params as required by Next.js 15+
    const { id } = await params;

    // Verify admin access
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    // Get user's name for audit trail
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('full_name, email')
      .eq('id', auth.userId)
      .single();

    // Parse request body
    const updates = await request.json();
    console.log(`Updating job order ${id} with:`, updates);

    // Get the current job order before updating (for audit trail)
    const { data: oldJobOrder, error: fetchError } = await supabaseAdmin
      .from('job_orders')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !oldJobOrder) {
      return NextResponse.json(
        { error: 'Job order not found' },
        { status: 404 }
      );
    }

    // Build update object - only include fields that were actually sent
    const updateFields: Record<string, any> = {
      updated_at: new Date().toISOString()
    };

    const allowedFields = [
      'arrival_time', 'shop_arrival_time', 'location', 'address',
      'customer_name', 'foreman_name', 'foreman_phone', 'equipment_needed',
      'description', 'assigned_to', 'scheduled_date', 'end_date',
      'estimated_hours', 'operator_name', 'status', 'priority',
    ];

    allowedFields.forEach(field => {
      if (field in updates) {
        updateFields[field] = updates[field];
      }
    });

    // Update job order
    const { data: jobOrder, error: updateError } = await supabaseAdmin
      .from('job_orders')
      .update(updateFields)
      .eq('id', id)
      .select()
      .single();

    console.log('Update result:', { jobOrder, updateError });

    if (!updateError && jobOrder) {
      // Create audit trail entry - track what changed
      const changes: Record<string, { old: any; new: any }> = {};

      // Compare old vs new values
      const fieldsToTrack = [
        'arrival_time',
        'shop_arrival_time',
        'location',
        'address',
        'customer_name',
        'foreman_name',
        'foreman_phone',
        'equipment_needed',
        'description',
        'assigned_to',
        'scheduled_date',
        'end_date',
        'estimated_hours',
        'operator_name',
        'status',
        'priority',
      ];

      fieldsToTrack.forEach(field => {
        const oldValue = oldJobOrder[field];
        const newValue = updates[field];

        // Check if value actually changed
        if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
          changes[field] = {
            old: oldValue,
            new: newValue
          };
        }
      });

      // Only log if something actually changed — gracefully handle missing history table
      if (Object.keys(changes).length > 0) {
        const { error: historyError } = await supabaseAdmin
          .from('job_orders_history')
          .insert({
            job_order_id: id,
            job_number: jobOrder.job_number,
            changed_by: auth.userId,
            changed_by_name: profile?.full_name || auth.userEmail,
            changed_by_role: auth.role,
            change_type: 'updated',
            changes: changes,
            snapshot: jobOrder, // Store complete snapshot
          });

        if (historyError) {
          // If table doesn't exist yet, don't block the update
          if (isTableNotFoundError(historyError)) {
            console.log('Audit trail skipped: history table not available yet');
          } else {
            console.error('Error logging audit trail:', historyError);
          }
        } else {
          console.log('Audit trail logged:', Object.keys(changes));
        }
      }
    }

    if (updateError) {
      console.error('Error updating job order:', updateError);
      return NextResponse.json(
        { error: 'Failed to update job order' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Job order updated successfully',
        data: jobOrder,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Unexpected error in update job order route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Await params as required by Next.js 15+
    const { id } = await params;

    // Verify admin access
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    // Get user's name for audit trail
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('full_name, email')
      .eq('id', auth.userId)
      .single();

    // Get the job order before deleting (for audit trail)
    const { data: jobOrder, error: fetchError } = await supabaseAdmin
      .from('job_orders')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !jobOrder) {
      return NextResponse.json(
        { error: 'Job order not found' },
        { status: 404 }
      );
    }

    // Create audit trail entry before deletion — gracefully handle missing table
    const { error: deleteHistoryError } = await supabaseAdmin
      .from('job_orders_history')
      .insert({
        job_order_id: id,
        job_number: jobOrder.job_number,
        changed_by: auth.userId,
        changed_by_name: profile?.full_name || auth.userEmail,
        changed_by_role: auth.role,
        change_type: 'deleted',
        changes: { deleted: { old: jobOrder, new: null } },
        snapshot: jobOrder,
      });

    if (deleteHistoryError && !(isTableNotFoundError(deleteHistoryError))) {
      console.error('Error logging deletion audit trail:', deleteHistoryError);
    }

    // Delete the job order
    const { error: deleteError } = await supabaseAdmin
      .from('job_orders')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Error deleting job order:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete job order' },
        { status: 500 }
      );
    }

    console.log(`Job order ${id} deleted by ${profile?.full_name || auth.userEmail}`);

    return NextResponse.json(
      {
        success: true,
        message: 'Job order deleted successfully',
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Unexpected error in delete job order route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
