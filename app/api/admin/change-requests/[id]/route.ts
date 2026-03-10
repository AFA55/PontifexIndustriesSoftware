/**
 * PATCH /api/admin/change-requests/[id]
 * Approve or reject a change request.
 * Access: super_admin only
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireSuperAdmin } from '@/lib/api-auth';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireSuperAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id } = await params;
    const body = await request.json();

    if (!body.status || !['approved', 'rejected'].includes(body.status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be "approved" or "rejected".' },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('schedule_change_requests')
      .update({
        status: body.status,
        reviewed_by: auth.userId,
        reviewed_at: new Date().toISOString(),
        review_notes: body.reviewNotes || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating change request:', error);
      return NextResponse.json(
        { error: 'Failed to update change request' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Change request ${body.status}`,
      data,
    });
  } catch (error) {
    console.error('Unexpected error in PATCH /api/admin/change-requests/[id]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
