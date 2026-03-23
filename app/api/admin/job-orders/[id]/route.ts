/**
 * API Route: PATCH /api/admin/job-orders/[id]
 * Update a job order (admin only)
 *
 * API Route: DELETE /api/admin/job-orders/[id]
 * Delete a job order (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isTableNotFoundError } from '@/lib/api-auth';

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

    // Check if user is admin or super_admin
    if (!['admin', 'super_admin', 'operations_manager', 'supervisor'].includes(profile.role)) {
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
      'description', 'assigned_to', 'helper_assigned_to', 'scheduled_date', 'end_date',
      'estimated_hours', 'estimated_cost', 'operator_name', 'status', 'priority',
      'is_will_call', 'difficulty_rating',
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
          if (isTableNotFoundError(historyError)) {
            console.log('Audit trail skipped: history table not available yet');
          } else {
            console.error('Error logging audit trail:', historyError);
          }
        } else {
          console.log('Audit trail logged:', Object.keys(changes));
        }

        // Auto-create a change_log note in job_notes for the schedule board
        const changeDescriptions = Object.entries(changes).map(([field, { old: oldVal, new: newVal }]) => {
          const label = field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          return `${label}: "${oldVal || '(empty)'}" → "${newVal || '(empty)'}"`;
        });

        const { error: noteError } = await supabaseAdmin
          .from('job_notes')
          .insert({
            job_order_id: id,
            author_id: user.id,
            author_name: profile.full_name || user.email || 'System',
            content: changeDescriptions.join('\n'),
            note_type: 'change_log',
            metadata: { changes },
          });

        if (noteError) {
          if (isTableNotFoundError(noteError)) {
            console.log('Change log note skipped: job_notes table not available yet');
          } else {
            console.error('Error creating change_log note:', noteError);
          }
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

    // Check if user is admin or super_admin
    if (!['admin', 'super_admin', 'operations_manager', 'supervisor'].includes(profile.role)) {
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
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
