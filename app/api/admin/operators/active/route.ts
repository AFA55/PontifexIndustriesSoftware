/**
 * API Route: GET /api/admin/operators/active
 * Get all active operators with their current status (admin only)
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
        { error: 'Only administrators can view operator status' },
        { status: 403 }
      );
    }

    // Get all active operators — try the view first, fall back to empty
    let activeOperators: any[] = [];
    const { data: viewData, error: fetchError } = await supabaseAdmin
      .from('current_operator_status')
      .select('*')
      .order('timestamp', { ascending: false });

    if (!fetchError && viewData) {
      activeOperators = viewData;
    }
    // If view doesn't exist yet (PGRST205), gracefully return empty list

    // Get status history for each operator (last 5 status changes)
    const operatorsWithHistory = await Promise.all(
      (activeOperators || []).map(async (operator) => {
        const { data: history } = await supabaseAdmin
          .from('operator_status_history')
          .select('*')
          .eq('user_id', operator.user_id)
          .order('timestamp', { ascending: false })
          .limit(5);

        return {
          ...operator,
          statusHistory: history || [],
        };
      })
    );

    // Calculate summary stats
    const summary = {
      totalActive: operatorsWithHistory.length,
      byStatus: {
        clocked_in: operatorsWithHistory.filter(op => op.status === 'clocked_in').length,
        en_route: operatorsWithHistory.filter(op => op.status === 'en_route').length,
        in_progress: operatorsWithHistory.filter(op => op.status === 'in_progress').length,
        job_completed: operatorsWithHistory.filter(op => op.status === 'job_completed').length,
      },
      totalHoursWorked: operatorsWithHistory.reduce((sum, op) => sum + (op.hours_worked || 0), 0),
    };

    return NextResponse.json(
      {
        success: true,
        data: {
          operators: operatorsWithHistory,
          summary,
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Unexpected error in active operators route:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
