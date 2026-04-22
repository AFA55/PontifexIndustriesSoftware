export const dynamic = 'force-dynamic';

/**
 * API Route: GET/PATCH /api/admin/commission
 * GET  - Retrieve commission rate and monthly earnings breakdown.
 * PATCH - Update commission rate (salesman own, or super_admin for anyone).
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, ADMIN_ROLES } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get('userId');

    // Non-admins can only read their own commission row
    let lookupUserId = auth.userId;
    if (targetUserId && targetUserId !== auth.userId) {
      if (!ADMIN_ROLES.includes(auth.role as typeof ADMIN_ROLES[number])) {
        return NextResponse.json(
          { error: 'Forbidden. You can only view your own commission.' },
          { status: 403 }
        );
      }
      lookupUserId = targetUserId;
    }

    // Get the profile with commission_rate
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('commission_rate')
      .eq('id', lookupUserId)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const commissionRate = Number(profile.commission_rate || 0);

    // Get completed jobs for this user over the last 12 months
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const { data: completedJobs } = await supabaseAdmin
      .from('job_orders')
      .select('estimated_cost, completed_at, created_at')
      .eq('created_by', lookupUserId)
      .eq('status', 'completed')
      .gte('created_at', twelveMonthsAgo.toISOString());

    // Group by month
    const monthlyMap: Record<string, { jobs_completed: number; total_revenue: number; commission_earned: number }> = {};
    for (const j of completedJobs || []) {
      const dateStr = j.completed_at || j.created_at;
      if (!dateStr) continue;
      const month = dateStr.substring(0, 7); // YYYY-MM
      if (!monthlyMap[month]) {
        monthlyMap[month] = { jobs_completed: 0, total_revenue: 0, commission_earned: 0 };
      }
      const cost = Number(j.estimated_cost || 0);
      monthlyMap[month].jobs_completed++;
      monthlyMap[month].total_revenue += cost;
      monthlyMap[month].commission_earned += cost * commissionRate;
    }

    const monthly = Object.entries(monthlyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({ month, ...data }));

    // Calculate totals
    const now = new Date();
    const thisMonth = now.toISOString().substring(0, 7);
    const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)
      .toISOString()
      .substring(0, 7);

    let allTime = 0;
    let thisMonthTotal = 0;
    let thisQuarterTotal = 0;

    for (const m of monthly) {
      allTime += m.commission_earned;
      if (m.month === thisMonth) thisMonthTotal += m.commission_earned;
      if (m.month >= quarterStart) thisQuarterTotal += m.commission_earned;
    }

    return NextResponse.json({
      success: true,
      data: {
        rate: commissionRate,
        monthly,
        totals: {
          all_time: allTime,
          this_month: thisMonthTotal,
          this_quarter: thisQuarterTotal,
        },
      },
    });
  } catch (error: any) {
    console.error('Error in commission GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const { commission_rate, userId: targetUserId } = body;

    if (commission_rate === undefined || commission_rate === null) {
      return NextResponse.json({ error: 'commission_rate is required' }, { status: 400 });
    }

    const rate = Number(commission_rate);
    if (isNaN(rate) || rate < 0 || rate > 1) {
      return NextResponse.json(
        { error: 'commission_rate must be a number between 0 and 1' },
        { status: 400 }
      );
    }

    // Determine whose rate to update
    let updateUserId = auth.userId;
    if (targetUserId && targetUserId !== auth.userId) {
      if (auth.role !== 'super_admin') {
        return NextResponse.json(
          { error: 'Forbidden. Only super admins can update other users\' commission rate.' },
          { status: 403 }
        );
      }
      updateUserId = targetUserId;
    }

    // Only salesman or super_admin can update commission rate
    if (auth.role !== 'super_admin') {
      // Verify the user is updating their own and is a salesman
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('role')
        .eq('id', auth.userId)
        .single();

      if (!profile || profile.role !== 'salesman') {
        return NextResponse.json(
          { error: 'Only salesman or super_admin can update commission rates.' },
          { status: 403 }
        );
      }
    }

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update({ commission_rate: rate })
      .eq('id', updateUserId)
      .select('id, full_name, email, commission_rate')
      .single();

    if (error) {
      console.error('Error updating commission rate:', error);
      return NextResponse.json({ error: 'Failed to update commission rate' }, { status: 500 });
    }

    // Fire-and-forget audit log
    Promise.resolve(
      supabaseAdmin.from('audit_logs').insert({
        user_id: auth.userId,
        action: 'commission_rate_updated',
        entity_type: 'profile',
        entity_id: updateUserId,
        details: { new_rate: rate, updated_by: auth.userId },
      })
    ).then(() => {}).catch(() => {});

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('Error in commission PATCH:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
