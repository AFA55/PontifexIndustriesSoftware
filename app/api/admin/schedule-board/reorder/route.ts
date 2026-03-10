/**
 * PATCH /api/admin/schedule-board/reorder
 * Move a job from one operator to another (reassign).
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
    const { jobOrderId, newOperatorId, newHelperId } = body;

    if (!jobOrderId) {
      return NextResponse.json(
        { error: 'Missing required field: jobOrderId' },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {
      assigned_to: newOperatorId || null,
      helper_assigned_to: newHelperId !== undefined ? (newHelperId || null) : undefined,
      status: newOperatorId ? 'assigned' : 'scheduled',
      updated_at: new Date().toISOString(),
    };

    // Remove undefined keys
    Object.keys(updateData).forEach(k => {
      if (updateData[k] === undefined) delete updateData[k];
    });

    const { data: updated, error } = await supabaseAdmin
      .from('job_orders')
      .update(updateData)
      .eq('id', jobOrderId)
      .select('id, job_number, customer_name, assigned_to, helper_assigned_to, status')
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
