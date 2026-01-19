/**
 * API Route: POST /api/admin/timecards/[id]/approve
 * Approve a timecard (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(
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
      .select('role')
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
        { error: 'Only administrators can approve timecards' },
        { status: 403 }
      );
    }

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
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      })
      .eq('id', timecardId)
      .select()
      .single();

    if (updateError) {
      console.error('Error approving timecard:', updateError);
      return NextResponse.json(
        { error: 'Failed to approve timecard', details: updateError.message },
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
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
