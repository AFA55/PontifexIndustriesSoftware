/**
 * API Route: GET/POST /api/admin/payroll/periods
 * Manage payroll periods (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { logAudit, getRequestContext } from '@/lib/audit';

// GET: Fetch payroll periods with optional filtering
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '20');

    // Build query
    let query = supabaseAdmin
      .from('pay_periods')
      .select('*')
      .order('period_start', { ascending: false });

    // Apply filters
    if (status) {
      query = query.eq('status', status);
    }

    // Apply limit
    query = query.limit(limit);

    const { data: periods, error: fetchError } = await query;

    if (fetchError) {
      console.error('Error fetching pay periods:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch pay periods' },
        { status: 500 }
      );
    }

    // Calculate summary counts by status
    const statusCounts = (periods || []).reduce((acc: Record<string, number>, period) => {
      acc[period.status] = (acc[period.status] || 0) + 1;
      return acc;
    }, {});

    return NextResponse.json(
      {
        success: true,
        data: {
          periods: periods || [],
          summary: {
            totalPeriods: periods?.length || 0,
            statusCounts,
          },
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Unexpected error in payroll periods route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST: Create a new payroll period (admin only)
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    // Parse request body
    const body = await request.json();

    // Validate required fields
    if (!body.period_start || !body.period_end) {
      return NextResponse.json(
        { error: 'Missing required fields: period_start, period_end' },
        { status: 400 }
      );
    }

    // Validate period_start < period_end
    if (new Date(body.period_start) >= new Date(body.period_end)) {
      return NextResponse.json(
        { error: 'period_start must be before period_end' },
        { status: 400 }
      );
    }

    // Check for overlapping periods
    const { data: overlapping, error: overlapError } = await supabaseAdmin
      .from('pay_periods')
      .select('id, period_start, period_end')
      .or(`and(period_start.lte.${body.period_end},period_end.gte.${body.period_start})`);

    if (overlapError) {
      console.error('Error checking for overlapping periods:', overlapError);
      return NextResponse.json(
        { error: 'Failed to validate period dates' },
        { status: 500 }
      );
    }

    if (overlapping && overlapping.length > 0) {
      return NextResponse.json(
        { error: 'This period overlaps with an existing pay period' },
        { status: 409 }
      );
    }

    // Prepare period data
    const periodData: Record<string, any> = {
      period_start: body.period_start,
      period_end: body.period_end,
      status: 'open',
    };

    if (body.pay_date) {
      periodData.pay_date = body.pay_date;
    }

    // Insert pay period
    const { data: period, error: insertError } = await supabaseAdmin
      .from('pay_periods')
      .insert(periodData)
      .select()
      .single();

    if (insertError) {
      console.error('Error creating pay period:', insertError);
      return NextResponse.json(
        { error: 'Failed to create pay period' },
        { status: 500 }
      );
    }

    // Audit log
    const ctx = getRequestContext(request);
    await logAudit({
      userId: auth.userId,
      userEmail: auth.userEmail,
      userRole: auth.role,
      action: 'create',
      entityType: 'pay_period',
      entityId: period?.id,
      description: `Created pay period ${body.period_start} to ${body.period_end}`,
      changes: { status: { from: null, to: 'open' } },
      metadata: { pay_date: body.pay_date || null },
      ...ctx,
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Pay period created successfully',
        data: period,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Unexpected error in create pay period route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
