export const dynamic = 'force-dynamic';

/**
 * API Route: GET /api/admin/jobs/[id]/progress-by-day
 *
 * Multi-day progress rollup for a job.
 *
 * Response shape:
 * {
 *   success: true,
 *   data: {
 *     days: [{
 *       date,
 *       day_number,
 *       in_route_at,              // earliest route_started_at / status-change / clock-in
 *       work_started_at,
 *       day_completed_at,
 *       hours_worked,
 *       notes,
 *       operators: [{ id, name }],
 *       entries: [{
 *         scope_item_id, description, work_type, unit,
 *         quantity_completed, target_quantity,
 *         cumulative_quantity, cumulative_pct,
 *         operator_id, operator_name, notes
 *       }],
 *       day_totals: { total_quantity, operator_count, entry_count }
 *     }],
 *     scope_progress: [{
 *       scope_item_id, description, work_type, unit,
 *       target_quantity, completed_quantity, pct_complete
 *     }],
 *     change_orders: {
 *       count, approved_price, approved_cost, pending_price
 *     }
 *   }
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId } = await context.params;
    const tenantId = auth.tenantId;

    // 1. Scope items (the source-of-truth targets)
    const { data: scopeItems } = await supabaseAdmin
      .from('job_scope_items')
      .select('id, work_type, description, unit, target_quantity, sort_order')
      .eq('job_order_id', jobId)
      .eq('tenant_id', tenantId)
      .order('sort_order', { ascending: true });

    // 2. Progress entries
    const { data: progressEntries } = await supabaseAdmin
      .from('job_progress_entries')
      .select(`
        id,
        scope_item_id,
        quantity_completed,
        date,
        notes,
        work_type,
        operator_id,
        profiles!job_progress_entries_operator_id_fkey(full_name),
        job_scope_items!job_progress_entries_scope_item_id_fkey(description, work_type, unit, target_quantity)
      `)
      .eq('job_order_id', jobId)
      .eq('tenant_id', tenantId)
      .order('date', { ascending: true });

    // 3. Daily job logs (in_route, work_started, day_completed)
    const { data: dailyLogs } = await supabaseAdmin
      .from('daily_job_logs')
      .select(`
        id, log_date, day_number, operator_id,
        route_started_at, work_started_at, day_completed_at,
        hours_worked, notes,
        profiles!daily_job_logs_operator_id_fkey(full_name)
      `)
      .eq('job_order_id', jobId)
      .order('log_date', { ascending: true });

    // 4. Status history — fallback for in_route timestamp if daily log missing
    const { data: statusHistory } = await supabaseAdmin
      .from('job_status_history')
      .select('id, old_status, new_status, changed_at, changed_by')
      .eq('job_id', jobId)
      .order('changed_at', { ascending: true });

    // 5. Timecards — fallback for in_route if no daily_job_logs.route_started_at
    const { data: timecards } = await supabaseAdmin
      .from('timecards')
      .select('id, user_id, clock_in_time, date')
      .eq('job_order_id', jobId)
      .order('clock_in_time', { ascending: true });

    // ── Build scope_progress summary (cumulative totals) ─────────────────────
    const scopeMap: Record<string, {
      scope_item_id: string;
      description: string | null;
      work_type: string;
      unit: string;
      target_quantity: number;
      completed_quantity: number;
      pct_complete: number;
    }> = {};
    for (const s of scopeItems || []) {
      scopeMap[s.id] = {
        scope_item_id: s.id,
        description: s.description,
        work_type: s.work_type,
        unit: s.unit,
        target_quantity: Number(s.target_quantity || 0),
        completed_quantity: 0,
        pct_complete: 0,
      };
    }
    for (const e of progressEntries || []) {
      if (e.scope_item_id && scopeMap[e.scope_item_id]) {
        scopeMap[e.scope_item_id].completed_quantity += Number(e.quantity_completed || 0);
      }
    }
    for (const k of Object.keys(scopeMap)) {
      const s = scopeMap[k];
      s.pct_complete = s.target_quantity > 0
        ? parseFloat(Math.min(100, (s.completed_quantity / s.target_quantity) * 100).toFixed(1))
        : 0;
    }
    const scopeProgress = Object.values(scopeMap);

    // ── Group entries by date ────────────────────────────────────────────────
    const entriesByDate: Record<string, any[]> = {};
    // Track cumulative per scope item through time (sorted by date asc)
    const cumByScope: Record<string, number> = {};

    for (const e of progressEntries || []) {
      const dateKey = e.date;
      const scopeRef = (e.job_scope_items as any) || {};
      const sid = e.scope_item_id as string | null;
      const qty = Number(e.quantity_completed || 0);
      const target = Number(scopeRef.target_quantity || (sid ? scopeMap[sid]?.target_quantity : 0) || 0);
      if (sid) {
        cumByScope[sid] = (cumByScope[sid] || 0) + qty;
      }
      const cumulative = sid ? cumByScope[sid] : qty;
      const cumPct = target > 0 ? parseFloat(Math.min(100, (cumulative / target) * 100).toFixed(1)) : 0;

      if (!entriesByDate[dateKey]) entriesByDate[dateKey] = [];
      entriesByDate[dateKey].push({
        id: e.id,
        scope_item_id: sid,
        description: scopeRef.description ?? null,
        work_type: scopeRef.work_type ?? e.work_type ?? null,
        unit: scopeRef.unit ?? null,
        quantity_completed: qty,
        target_quantity: target,
        cumulative_quantity: cumulative,
        cumulative_pct: cumPct,
        operator_id: e.operator_id,
        operator_name: (e.profiles as any)?.full_name ?? 'Unknown',
        notes: e.notes ?? null,
      });
    }

    // ── Group daily logs by date ─────────────────────────────────────────────
    const logsByDate: Record<string, any[]> = {};
    for (const log of dailyLogs || []) {
      const d = log.log_date as string;
      if (!logsByDate[d]) logsByDate[d] = [];
      logsByDate[d].push(log);
    }

    // ── Group timecards by date (fallback in_route) ──────────────────────────
    const timecardsByDate: Record<string, any[]> = {};
    for (const tc of timecards || []) {
      const d = tc.date as string;
      if (!timecardsByDate[d]) timecardsByDate[d] = [];
      timecardsByDate[d].push(tc);
    }

    // ── Status-history earliest in_route change (single timestamp for whole job) ─
    const firstInRouteChange = (statusHistory || []).find(
      (s) => s.new_status === 'in_route' || s.new_status === 'enroute'
    );

    // ── Build unique set of dates from progress + daily logs ─────────────────
    const allDates = new Set<string>([
      ...Object.keys(entriesByDate),
      ...Object.keys(logsByDate),
    ]);
    const sortedDates = Array.from(allDates).sort();

    const days = sortedDates.map((date, idx) => {
      const logs = logsByDate[date] || [];
      const entries = entriesByDate[date] || [];
      const tcs = timecardsByDate[date] || [];

      // Derive in_route timestamp — prefer daily_job_logs.route_started_at,
      // then earliest timecard clock_in, then status history for the whole job
      const logRouteStart = logs
        .map((l) => l.route_started_at)
        .filter(Boolean)
        .sort()[0] || null;
      const firstClockIn = tcs
        .map((t) => t.clock_in_time)
        .filter(Boolean)
        .sort()[0] || null;
      const statusFallback =
        firstInRouteChange && String(firstInRouteChange.changed_at).startsWith(date)
          ? firstInRouteChange.changed_at
          : null;

      const inRouteAt = logRouteStart || firstClockIn || statusFallback;

      const workStart = logs
        .map((l) => l.work_started_at)
        .filter(Boolean)
        .sort()[0] || null;

      const dayComplete = logs
        .map((l) => l.day_completed_at)
        .filter(Boolean)
        .sort()
        .reverse()[0] || null;

      const hours = logs.reduce((s, l) => s + Number(l.hours_worked || 0), 0);

      // Unique operators active on this day (from logs + entries + timecards)
      const operatorMap: Record<string, { id: string; name: string }> = {};
      for (const l of logs) {
        if (l.operator_id) {
          operatorMap[l.operator_id] = {
            id: l.operator_id,
            name: (l.profiles as any)?.full_name ?? 'Unknown',
          };
        }
      }
      for (const e of entries) {
        if (e.operator_id && !operatorMap[e.operator_id]) {
          operatorMap[e.operator_id] = { id: e.operator_id, name: e.operator_name };
        }
      }

      const dayTotals = {
        total_quantity: entries.reduce((s, e) => s + (e.quantity_completed || 0), 0),
        operator_count: Object.keys(operatorMap).length,
        entry_count: entries.length,
      };

      return {
        date,
        day_number:
          (logs.find((l) => l.day_number != null)?.day_number as number | undefined) ??
          idx + 1,
        in_route_at: inRouteAt,
        work_started_at: workStart,
        day_completed_at: dayComplete,
        hours_worked: hours,
        notes: logs.map((l) => l.notes).filter(Boolean).join(' | ') || null,
        operators: Object.values(operatorMap),
        entries,
        day_totals: dayTotals,
      };
    });

    // ── Change-order rollup for convenience ──────────────────────────────────
    const { data: changeOrders } = await supabaseAdmin
      .from('change_orders')
      .select('id, status, cost_amount, price_amount')
      .eq('job_order_id', jobId)
      .eq('tenant_id', tenantId);
    const coTotals = (changeOrders || []).reduce(
      (acc, co) => {
        const price = Number(co.price_amount || 0);
        const cost = Number(co.cost_amount || 0);
        if (co.status === 'approved' || co.status === 'invoiced') {
          acc.approved_price += price;
          acc.approved_cost += cost;
        }
        if (co.status === 'pending') acc.pending_price += price;
        return acc;
      },
      { approved_price: 0, approved_cost: 0, pending_price: 0 }
    );

    return NextResponse.json({
      success: true,
      data: {
        days,
        scope_progress: scopeProgress,
        change_orders: {
          count: (changeOrders || []).length,
          ...coTotals,
        },
      },
    });
  } catch (error: unknown) {
    console.error('Unexpected error in GET /progress-by-day:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
