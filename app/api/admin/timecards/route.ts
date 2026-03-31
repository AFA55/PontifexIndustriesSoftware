/**
 * API Route: GET /api/admin/timecards
 * Get all timecards for admin viewing (requires admin role)
 *
 * Query params:
 *   userId    — filter to a specific operator
 *   startDate — YYYY-MM-DD lower bound
 *   endDate   — YYYY-MM-DD upper bound
 *   pending   — 'true' to show only un-approved entries
 *   status    — 'active' for currently clocked-in, 'completed' for clocked-out
 *   limit     — max results (default 100)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin, isTableNotFoundError } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const tenantId = auth.tenantId;

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const pending = searchParams.get('pending');
    const status = searchParams.get('status'); // 'active' | 'completed'
    const limit = Math.min(parseInt(searchParams.get('limit') || '100') || 100, 500);

    // Use the view that joins with profiles for user details
    let query = supabaseAdmin
      .from('timecards_with_users')
      .select('*')
      .order('clock_in_time', { ascending: false });

    // Scope to tenant
    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    }

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
      query = query.eq('approval_status', 'pending');
    }

    if (status === 'active') {
      query = query.is('clock_out_time', null);
    } else if (status === 'completed') {
      query = query.not('clock_out_time', 'is', null);
    }

    // Apply limit
    query = query.limit(limit);

    const { data: timecards, error: fetchError } = await query;

    if (fetchError) {
      if (isTableNotFoundError(fetchError)) {
        return NextResponse.json(
          { success: true, data: { timecards: [], summary: { totalEntries: 0, totalHours: 0, pendingApproval: 0, activeEntries: 0 }, userSummary: [] } },
          { status: 200 }
        );
      }
      console.error('Error fetching timecards:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch timecards' },
        { status: 500 }
      );
    }

    // Calculate summary statistics
    const totalHours = timecards?.reduce((sum: number, tc: any) => sum + (tc.total_hours || 0), 0) || 0;
    const totalEntries = timecards?.length || 0;
    const pendingApproval = timecards?.filter((tc: any) => !tc.is_approved).length || 0;
    const activeEntries = timecards?.filter((tc: any) => tc.clock_out_time === null).length || 0;

    // Group by user
    const userSummary = timecards?.reduce((acc: any, tc: any) => {
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
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
