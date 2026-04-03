export const dynamic = 'force-dynamic';

/**
 * API Route: GET /api/shop/dashboard-stats
 * Returns summary statistics for the shop dashboard.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireShopUser } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireShopUser(request);
    if (!auth.authorized) return auth.response;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString();

    // Parallel queries for performance
    const [
      pendingRes,
      inProgressRes,
      completedTodayRes,
      criticalRes,
      overdueRes,
      upcomingRes,
      recentRes,
    ] = await Promise.all([
      // Pending work orders
      supabaseAdmin
        .from('maintenance_work_orders')
        .select('id', { count: 'exact', head: true })
        .in('status', ['pending', 'assigned']),

      // In progress
      supabaseAdmin
        .from('maintenance_work_orders')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'in_progress'),

      // Completed today
      supabaseAdmin
        .from('maintenance_work_orders')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'completed')
        .gte('completed_at', todayISO),

      // Critical priority (not completed/cancelled)
      supabaseAdmin
        .from('maintenance_work_orders')
        .select('id', { count: 'exact', head: true })
        .eq('priority', 'critical')
        .not('status', 'in', '("completed","cancelled")'),

      // Overdue scheduled maintenance
      supabaseAdmin
        .from('scheduled_maintenance')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true)
        .lt('next_due_at', new Date().toISOString()),

      // Upcoming scheduled maintenance (next 5)
      supabaseAdmin
        .from('scheduled_maintenance')
        .select('id, name, description, category, unit_id, next_due_at, interval_days')
        .eq('is_active', true)
        .order('next_due_at', { ascending: true, nullsFirst: false })
        .limit(5),

      // Recent completions (last 5)
      supabaseAdmin
        .from('maintenance_work_orders')
        .select('id, title, completed_at, total_cost, unit_id')
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(5),
    ]);

    // Enrich upcoming scheduled with unit names
    let upcomingScheduled = upcomingRes.data || [];
    if (upcomingScheduled.length > 0) {
      const unitIds = upcomingScheduled
        .filter((s: any) => s.unit_id)
        .map((s: any) => s.unit_id);

      if (unitIds.length > 0) {
        const { data: units } = await supabaseAdmin
          .from('equipment_units')
          .select('id, name, pontifex_id')
          .in('id', unitIds);

        const unitMap = new Map((units || []).map((u: any) => [u.id, u]));
        upcomingScheduled = upcomingScheduled.map((s: any) => ({
          ...s,
          unit_name: s.unit_id ? unitMap.get(s.unit_id)?.name || null : null,
        }));
      }
    }

    // Enrich recent completions with unit names
    let recentCompletions = recentRes.data || [];
    if (recentCompletions.length > 0) {
      const unitIds = recentCompletions
        .filter((r: any) => r.unit_id)
        .map((r: any) => r.unit_id);

      if (unitIds.length > 0) {
        const { data: units } = await supabaseAdmin
          .from('equipment_units')
          .select('id, name')
          .in('id', unitIds);

        const unitMap = new Map((units || []).map((u: any) => [u.id, u.name]));
        recentCompletions = recentCompletions.map((r: any) => ({
          ...r,
          unit_name: r.unit_id ? unitMap.get(r.unit_id) || null : null,
        }));
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        pending_work_orders: pendingRes.count || 0,
        in_progress_work_orders: inProgressRes.count || 0,
        completed_today: completedTodayRes.count || 0,
        critical_priority: criticalRes.count || 0,
        overdue_scheduled: overdueRes.count || 0,
        upcoming_scheduled: upcomingScheduled,
        recent_completions: recentCompletions,
      },
    });
  } catch (error: any) {
    console.error('[shop/dashboard-stats GET] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
