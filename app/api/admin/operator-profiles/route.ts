/**
 * API Route: GET /api/admin/operator-profiles
 * Get all operator profiles with analytics data
 *
 * API Route: POST /api/admin/operator-profiles
 * Create a new operator profile (not typically used, operators created via team management)
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
        { error: 'Only administrators can view operator profiles' },
        { status: 403 }
      );
    }

    // Get all operators with their profile data
    const { data: operators, error: operatorsError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .in('role', ['operator', 'apprentice'])
      .eq('active', true)
      .order('full_name');

    if (operatorsError) {
      console.error('Error fetching operators:', operatorsError);
      return NextResponse.json(
        { error: 'Failed to fetch operator profiles', details: operatorsError.message },
        { status: 500 }
      );
    }

    // Get performance data for each operator
    const operatorIds = operators?.map(op => op.id) || [];

    const { data: performanceData } = await supabaseAdmin
      .from('operator_performance')
      .select('*')
      .in('operator_id', operatorIds);

    // Merge performance data with operator profiles
    const operatorsWithPerformance = operators?.map(operator => {
      const performance = performanceData?.find(p => p.operator_id === operator.id);
      return {
        ...operator,
        performance: performance || {
          total_jobs_completed: 0,
          total_revenue_generated: 0,
          total_hours_worked: 0,
          avg_production_rate: 0,
          revenue_per_hour: 0,
          on_time_completion_rate: 0,
        }
      };
    }) || [];

    return NextResponse.json(
      {
        success: true,
        data: operatorsWithPerformance,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Unexpected error in get operator profiles route:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
