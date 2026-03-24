/**
 * API Route: GET /api/admin/operator-profiles
 * Get all operator profiles with analytics data
 *
 * API Route: POST /api/admin/operator-profiles
 * Create a new operator profile (not typically used, operators created via team management)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    // Get user from Supabase session (server-side)
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

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
        { error: 'Failed to fetch operator profiles' },
        { status: 500 }
      );
    }

    // Get performance data for each operator — gracefully handle missing table
    const operatorIds = operators?.map(op => op.id) || [];

    let performanceData: any[] | null = null;
    const { data: perfData, error: perfError } = await supabaseAdmin
      .from('operator_performance')
      .select('*')
      .in('operator_id', operatorIds);

    if (!perfError) {
      performanceData = perfData;
    }
    // If table doesn't exist, performanceData stays null — defaults will be used below

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
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
