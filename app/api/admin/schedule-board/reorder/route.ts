/**
 * PATCH /api/admin/schedule-board/reorder
 * Move a job from one operator to another (reassign) and/or update board_sort_position.
 * Body: { jobOrderId, newOperatorId?, newHelperId?, board_sort_position? }
 *   — OR (dnd-kit format): { jobId, newOperatorId?, board_sort_position? }
 * Access: super_admin only
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireSuperAdmin } from '@/lib/api-auth';

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireSuperAdmin(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    // Support both naming conventions
    const jobOrderId = body.jobOrderId || body.jobId;
    const { newOperatorId, newHelperId, board_sort_position } = body;

    if (!jobOrderId) {
      return NextResponse.json(
        { error: 'Missing required field: jobOrderId or jobId' },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    // Only update assignment fields if explicitly provided
    if (newOperatorId !== undefined) {
      updateData.assigned_to = newOperatorId || null;
      updateData.status = newOperatorId ? 'assigned' : 'scheduled';
    }

    if (newHelperId !== undefined) {
      updateData.helper_assigned_to = newHelperId || null;
    }

    if (board_sort_position !== undefined && typeof board_sort_position === 'number') {
      updateData.board_sort_position = board_sort_position;
    }

    const { data: updated, error } = await supabaseAdmin
      .from('job_orders')
      .update(updateData)
      .eq('id', jobOrderId)
      .select('id, job_number, customer_name, assigned_to, helper_assigned_to, status, board_sort_position')
      .single();

    if (error) {
      console.error('Error reordering job:', error);
      return NextResponse.json(
        { error: 'Failed to reorder job' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Job reassigned successfully',
      data: updated,
    });
  } catch (error) {
    console.error('Unexpected error in PATCH /api/admin/schedule-board/reorder:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
