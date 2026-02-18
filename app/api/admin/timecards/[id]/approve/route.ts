/**
 * API Route: POST /api/admin/timecards/[id]/approve
 * Approve a timecard (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Await params in Next.js 15+
    const { id: timecardId } = await params;

    // Verify admin access
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    // Check if timecard exists
    const { data: existingTimecard, error: checkError } = await supabaseAdmin
      .from('timecards')
      .select('id, is_approved')
      .eq('id', timecardId)
      .single();

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
    const { data: updatedTimecard, error: updateError } = await supabaseAdmin
      .from('timecards')
      .update({
        is_approved: true,
        approved_by: auth.userId,
        approved_at: new Date().toISOString(),
      })
      .eq('id', timecardId)
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
  } catch (error: any) {
    console.error('Unexpected error in timecard approval route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
