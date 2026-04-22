export const dynamic = 'force-dynamic';

/**
 * API Route: GET /api/admin/jobs/[id]/detail
 * Aggregated job detail panel — all data for a single job in one request.
 * Powers the "click into a job from customer history" view.
 *
 * Returns: job row, operator/helper profiles, scope items with progress,
 *          timecards with aggregates, notes, daily logs, and computed totals.
 *
 * GET — admin / super_admin / operations_manager / supervisor / salesman
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getTenantId } from '@/lib/get-tenant-id';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const { id } = await params;

    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (
      !profile ||
      !['admin', 'super_admin', 'operations_manager', 'supervisor', 'salesman'].includes(
        profile.role
      )
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const tenantId = await getTenantId(user.id);

    // ── 1. Fetch full job row ────────────────────────────────────────────────
    let jobQuery = supabaseAdmin.from('job_orders').select('*').eq('id', id);
    if (tenantId) jobQuery = jobQuery.eq('tenant_id', tenantId);
    const { data: job, error: jobError } = await jobQuery.single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // ── 2-6. Parallel fetches ────────────────────────────────────────────────
    const [
      operatorResult,
      helperResult,
      scopeItemsResult,
      progressEntriesResult,
      timecardsResult,
      notesResult,
      dailyLogsResult,
    ] = await Promise.all([
      // 2a. Operator profile
      job.assigned_to
        ? supabaseAdmin
            .from('profiles')
            .select('id, full_name')
            .eq('id', job.assigned_to)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),

      // 2b. Helper profile
      (job as any).helper_assigned_to
        ? supabaseAdmin
            .from('profiles')
            .select('id, full_name')
            .eq('id', (job as any).helper_assigned_to)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),

      // 3. Scope items
      (() => {
        let q = supabaseAdmin
          .from('job_scope_items')
          .select('id, work_type, description, unit, target_quantity, sort_order')
          .eq('job_order_id', id);
        if (tenantId) q = q.eq('tenant_id', tenantId);
        return q.order('sort_order', { ascending: true });
      })(),

      // 4. Progress entries (grouped manually after fetch)
      (() => {
        let q = supabaseAdmin
          .from('job_progress_entries')
          .select('scope_item_id, quantity_completed')
          .eq('job_order_id', id);
        if (tenantId) q = q.eq('tenant_id', tenantId);
        return q;
      })(),

      // 5. Timecards
      (() => {
        let q = supabaseAdmin
          .from('timecards')
          .select('id, user_id, clock_in_time, clock_out_time, total_hours, labor_cost, is_approved, hour_type')
          .eq('job_order_id', id);
        if (tenantId) q = q.eq('tenant_id', tenantId);
        return q.order('clock_in_time', { ascending: true });
      })(),

      // 6. Job notes (exclude change_log entries)
      (() => {
        let q = supabaseAdmin
          .from('job_notes')
          .select('id, content, author_name, note_type, created_at, metadata')
          .eq('job_order_id', id)
          .neq('note_type', 'change_log');
        if (tenantId) q = q.eq('tenant_id', tenantId);
        return q.order('created_at', { ascending: false });
      })(),

      // 7. Daily job logs
      (() => {
        let q = supabaseAdmin
          .from('daily_job_logs')
          .select('day_number, hours_worked, date_worked, notes')
          .eq('job_order_id', id);
        if (tenantId) q = q.eq('tenant_id', tenantId);
        return q.order('day_number', { ascending: true });
      })(),
    ]);

    // ── 3. Merge scope items with progress ───────────────────────────────────
    const progressEntries = progressEntriesResult.data ?? [];

    // Sum quantity_completed per scope_item_id
    const completedByScopeItem: Record<string, number> = {};
    for (const entry of progressEntries) {
      if (entry.scope_item_id) {
        completedByScopeItem[entry.scope_item_id] =
          (completedByScopeItem[entry.scope_item_id] || 0) +
          Number(entry.quantity_completed ?? 0);
      }
    }

    let totalTargetQty = 0;
    let totalCompletedQty = 0;

    const scopeItems = (scopeItemsResult.data ?? []).map((item) => {
      const completed = completedByScopeItem[item.id] || 0;
      const target = Number(item.target_quantity ?? 0);
      const pct =
        target > 0 ? Math.min(100, Math.round((completed / target) * 100)) : 0;
      totalTargetQty += target;
      totalCompletedQty += completed;
      return {
        id: item.id,
        work_type: item.work_type ?? null,
        description: item.description ?? null,
        unit: item.unit ?? null,
        target_quantity: target,
        completed_qty: completed,
        pct_complete: pct,
        sort_order: item.sort_order ?? 0,
      };
    });

    const overallPct =
      totalTargetQty > 0
        ? Math.min(100, Math.round((totalCompletedQty / totalTargetQty) * 100))
        : 0;

    const completedScopeCount = scopeItems.filter((s) => s.pct_complete >= 100).length;

    // ── 5. Enrich timecards with operator names ──────────────────────────────
    const rawTimecards = timecardsResult.data ?? [];

    // Collect unique user_ids to batch-fetch names
    const uniqueOperatorIds = [...new Set(rawTimecards.map((tc) => tc.user_id).filter(Boolean))];

    let operatorNameMap: Record<string, string> = {};
    if (uniqueOperatorIds.length > 0) {
      const { data: tcProfiles } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name')
        .in('id', uniqueOperatorIds);
      for (const p of tcProfiles ?? []) {
        operatorNameMap[p.id] = p.full_name ?? 'Unknown';
      }
    }

    let totalHoursWorked = 0;
    let totalLaborCost = 0;

    const timecards = rawTimecards.map((tc) => {
      const hours = Number(tc.total_hours ?? 0);
      const cost = Number(tc.labor_cost ?? 0);
      totalHoursWorked += hours;
      totalLaborCost += cost;
      return {
        id: tc.id,
        operator_name: tc.user_id ? (operatorNameMap[tc.user_id] ?? 'Unknown') : 'Unknown',
        clock_in_time: tc.clock_in_time,
        clock_out_time: tc.clock_out_time ?? null,
        total_hours: tc.total_hours ?? null,
        labor_cost: tc.labor_cost ?? null,
        is_approved: tc.is_approved ?? false,
        hour_type: tc.hour_type ?? null,
      };
    });

    // ── Assemble response ────────────────────────────────────────────────────
    return NextResponse.json({
      success: true,
      data: {
        job,
        operator: operatorResult.data
          ? { id: operatorResult.data.id, full_name: operatorResult.data.full_name }
          : null,
        helper: helperResult.data
          ? { id: helperResult.data.id, full_name: helperResult.data.full_name }
          : null,
        scope_items: scopeItems,
        timecards,
        notes: (notesResult.data ?? []).map((n) => ({
          id: n.id,
          content: n.content ?? null,
          author_name: n.author_name ?? null,
          note_type: n.note_type ?? null,
          created_at: n.created_at,
          metadata: n.metadata ?? null,
        })),
        daily_logs: (dailyLogsResult.data ?? []).map((l) => ({
          day_number: l.day_number,
          hours_worked: l.hours_worked ?? null,
          date_worked: l.date_worked ?? null,
          notes: l.notes ?? null,
        })),
        totals: {
          total_hours: parseFloat(totalHoursWorked.toFixed(2)),
          total_labor_cost: parseFloat(totalLaborCost.toFixed(2)),
          scope_items_count: scopeItems.length,
          completed_scope_count: completedScopeCount,
          overall_pct: overallPct,
        },
      },
    });
  } catch (error: unknown) {
    console.error('Unexpected error in GET /api/admin/jobs/[id]/detail:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
