/**
 * API Route: POST /api/admin/timecards/[id]/approve
 * Approve a timecard entry (admin+ only).
 * Sets is_approved, approved_by, approved_at.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id: timecardId } = await params;
    const tenantId = auth.tenantId;

    // Check if timecard exists (scoped to tenant)
    let checkQuery = supabaseAdmin
      .from('timecards')
      .select('id, is_approved, user_id')
      .eq('id', timecardId);
    if (tenantId) {
      checkQuery = checkQuery.eq('tenant_id', tenantId);
    }
    const { data: existingTimecard, error: checkError } = await checkQuery.single();

    if (checkError || !existingTimecard) {
      return NextResponse.json(
        { error: 'Timecard not found' },
        { status: 404 }
      );
    }

    if (existingTimecard.is_approved) {
      return NextResponse.json(
        { error: 'Timecard is already approved' },
        { status: 400 }
      );
    }

    // Update timecard to approved
    let approveQuery = supabaseAdmin
      .from('timecards')
      .update({
        is_approved: true,
        approved_by: auth.userId,
        approved_at: new Date().toISOString(),
      })
      .eq('id', timecardId);
    if (tenantId) {
      approveQuery = approveQuery.eq('tenant_id', tenantId);
    }
    const { data: updatedTimecard, error: updateError } = await approveQuery
      .select()
      .single();

    if (updateError) {
      console.error('Error approving timecard:', updateError);
      return NextResponse.json(
        { error: 'Failed to approve timecard' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Timecard approved successfully',
        data: updatedTimecard,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error('Unexpected error in timecard approval route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
