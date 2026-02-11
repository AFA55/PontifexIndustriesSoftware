/**
 * API Route: PATCH /api/admin/job-orders/[id]
 * Update a job order (admin only)
 *
 * API Route: DELETE /api/admin/job-orders/[id]
 * Delete a job order (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Await params as required by Next.js 15+
    const { id } = await params;

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

    // Get user's role and name from profiles
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role, full_name, email')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'Failed to verify user role' },
        { status: 403 }
      );
    }

    // Check if user is admin
    if (profile.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only administrators can update job orders' },
        { status: 403 }
      );
    }

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
            changed_by: user.id,
            changed_by_name: profile.full_name || user.email,
            changed_by_role: profile.role,
            change_type: 'updated',
            changes: changes,
            snapshot: jobOrder, // Store complete snapshot
          });

        if (historyError) {
          // If table doesn't exist yet, don't block the update
          if (historyError.code === 'PGRST204' || historyError.code === 'PGRST205' || historyError.code === '42P01' || historyError.message?.includes('does not exist')) {
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
        { error: 'Failed to update job order', details: updateError.message },
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
      { error: 'Internal server error', details: error.message },
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

    // Get user's role and name from profiles
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role, full_name, email')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'Failed to verify user role' },
        { status: 403 }
      );
    }

    // Check if user is admin
    if (profile.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only administrators can delete job orders' },
        { status: 403 }
      );
    }

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
        changed_by: user.id,
        changed_by_name: profile.full_name || user.email,
        changed_by_role: profile.role,
        change_type: 'deleted',
        changes: { deleted: { old: jobOrder, new: null } },
        snapshot: jobOrder,
      });

    if (deleteHistoryError && !(deleteHistoryError.code === 'PGRST204' || deleteHistoryError.code === 'PGRST205' || deleteHistoryError.code === '42P01' || deleteHistoryError.message?.includes('does not exist'))) {
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
        { error: 'Failed to delete job order', details: deleteError.message },
        { status: 500 }
      );
    }

    console.log(`Job order ${id} deleted by ${profile.full_name}`);

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
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
