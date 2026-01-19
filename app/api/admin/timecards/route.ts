/**
 * API Route: GET /api/admin/timecards
 * Get all timecards for admin viewing (requires admin role)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  try {
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
        { error: 'Only administrators can view timecards' },
        { status: 403 }
      );
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const pending = searchParams.get('pending'); // Show only pending approval
    const limit = parseInt(searchParams.get('limit') || '100');

    // Use the view that joins with profiles for user details
    let query = supabaseAdmin
      .from('timecards_with_users')
      .select('*')
      .order('clock_in_time', { ascending: false });

    // Apply filters
    if (userId) {
      query = query.eq('user_id', userId);
    }

    if (startDate) {
      query = query.gte('date', startDate);
    }

    if (endDate) {
      query = query.lte('date', endDate);
    }

    if (pending === 'true') {
      query = query.eq('is_approved', false);
    }

    // Apply limit
    query = query.limit(limit);

    const { data: timecards, error: fetchError } = await query;

    if (fetchError) {
      console.error('Error fetching timecards:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch timecards', details: fetchError.message },
        { status: 500 }
      );
    }

    // Calculate summary statistics
    const totalHours = timecards?.reduce((sum, tc) => sum + (tc.total_hours || 0), 0) || 0;
    const totalEntries = timecards?.length || 0;
    const pendingApproval = timecards?.filter(tc => !tc.is_approved).length || 0;
    const activeEntries = timecards?.filter(tc => tc.clock_out_time === null).length || 0;

    // Group by user
    const userSummary = timecards?.reduce((acc: any, tc) => {
      if (!acc[tc.user_id]) {
        acc[tc.user_id] = {
          userId: tc.user_id,
          fullName: tc.full_name,
          email: tc.email,
          role: tc.role,
          totalHours: 0,
          entries: 0,
        };
      }
      acc[tc.user_id].totalHours += tc.total_hours || 0;
      acc[tc.user_id].entries += 1;
      return acc;
    }, {}) || {};

    return NextResponse.json(
      {
        success: true,
        data: {
          timecards: timecards || [],
          summary: {
            totalEntries,
            totalHours: parseFloat(totalHours.toFixed(2)),
            pendingApproval,
            activeEntries,
          },
          userSummary: Object.values(userSummary),
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Unexpected error in admin timecards route:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
