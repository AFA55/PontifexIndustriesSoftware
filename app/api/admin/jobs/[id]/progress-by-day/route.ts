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
import { requireSalesStaff } from '@/lib/api-auth';
import { loadJobProgress, explodeProgressEntries } from '@/lib/job-progress-server';
import { attributableTimecards } from '@/lib/job-clock-attribution';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    // READ-ONLY, so the guard matches who the PAGE already admits.
    // The job-detail page lets salesman + supervisor in, but every endpoint it
    // calls used requireAdmin (admin | super_admin | operations_manager) — so
    // Adam Ingalls (salesman, and the project manager on the job) opened his
    // own J. Davis job and got "Failed to load job details. HTTP 403". The UI
    // said yes and the API said no, which reads as the app being broken rather
    // than as a permission. Same shape as the approve-button bug.
    const auth = await requireSalesStaff(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId } = await context.params;
    const tenantId = auth.tenantId;

    // 1+2. Scope targets and the operator work logged against them, derived
    // from work_items. This replaced a read of `job_progress_entries`, a table
    // nothing in the codebase writes — see lib/job-progress.ts.
    const loaded = await loadJobProgress(jobId, tenantId);
    const scopeItems = loaded.scope_items;

    // Operator names for the entries below.
    const entryOperatorIds = Array.from(
      new Set(loaded.work_items.map((w) => w.operator_id).filter((v): v is string => !!v))
    );
    const operatorNames: Record<string, string> = {};
    if (entryOperatorIds.length > 0) {
      const { data: opProfiles } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name')
        .in('id', entryOperatorIds);
      for (const p of opProfiles ?? []) operatorNames[p.id] = p.full_name ?? 'Unknown';
    }

    const progressEntries = explodeProgressEntries(loaded).sort((a, b) =>
      String(a.date ?? '').localeCompare(String(b.date ?? ''))
    );

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

    // 5. Timecards — the CLOCK CARD, which is now the source of a day's hours.
    //
    // WHY (founder, Aug 11): "The hours it shows next to day one aren't
    // accurate… the total hours worked day to day is in Crew Clock Ins. We just
    // need to pull the data from a different place."
    //
    // Two problems with what was here. It filtered on `job_order_id`, and only
    // 34 of 251 timecards carry that link — so for most days it found nothing.
    // And the day's hours came from `daily_job_logs.hours_worked`, which is
    // derived from the en-route / work-started stamps the crew taps, not from
    // when they were actually on the clock.
    //
    // So: pull every clock card belonging to anyone who worked this job, on any
    // day this job ran, whether or not the card was linked to the job. Payroll
    // already trusts these numbers; the panel should show the same ones.
    // Everyone who touched this job: the two job-level slots, plus every
    // operator and helper who actually filed something. Several operators can
    // work one job (the founder's "the fields are plural for a reason"), so the
    // slots alone would miss most of the crew's hours.
    const [{ data: jobSlots }, { data: helperLogRows }] = await Promise.all([
      supabaseAdmin
        .from('job_orders')
        .select('assigned_to, helper_assigned_to')
        .eq('id', jobId)
        .maybeSingle(),
      supabaseAdmin
        .from('helper_work_logs')
        .select('helper_id, log_date')
        .eq('job_order_id', jobId),
    ]);

    const jobOperatorIds = Array.from(
      new Set(
        [
          ...(dailyLogs ?? []).map((l: any) => l.operator_id),
          ...(helperLogRows ?? []).map((h: any) => h.helper_id),
          (jobSlots as any)?.assigned_to,
          (jobSlots as any)?.helper_assigned_to,
        ].filter(Boolean) as string[]
      )
    );
    const jobLogDates = Array.from(
      new Set(
        [
          ...(dailyLogs ?? []).map((l: any) => l.log_date),
          ...(helperLogRows ?? []).map((h: any) => h.log_date),
        ].filter(Boolean) as string[]
      )
    );

    // ── WHICH CARDS BELONG TO THIS JOB ───────────────────────────────────────
    //
    // A clock card is one PERSON'S DAY. It is not a job record, and no amount of
    // inference makes it one. There are exactly two cases where attributing a
    // card to this job is a fact rather than a guess:
    //
    //   1. the card is explicitly linked to this job, or
    //   2. the card has no link at all AND that person touched only this one
    //      job that day — so every hour on the card can only have gone here.
    //
    // Everything else is unknowable and must NOT be counted. A first cut of this
    // guard only consulted `daily_job_logs`, which let three kinds of card leak:
    // helpers (who file helper_work_logs and no daily log), people merely
    // ASSIGNED to a second job, and cards linked to another job entirely. The
    // result was 62 cards attributed 73 times — 666 hours displayed against 565
    // real ones, 101 invented. On Parkk Concrete alone, Aug 4 showed 28.19
    // crew-hours of which 18.36 were simultaneously billed to two other jobs.
    // That is the founder's original complaint, re-created by the fix for it.
    const { cards: timecards, splitDates: unattributableDates } =
      await attributableTimecards(jobId, jobOperatorIds, jobLogDates);

    // ── scope_progress summary (cumulative totals) ───────────────────────────
    const scopeProgress = loaded.scope_progress;
    const targetById: Record<string, number> = {};
    for (const s of scopeItems) targetById[s.id] = Number(s.target_quantity || 0);

    // ── Group entries by date ────────────────────────────────────────────────
    const entriesByDate: Record<string, any[]> = {};
    // Track cumulative per scope item through time (entries are date-sorted).
    const cumByScope: Record<string, number> = {};

    for (const e of progressEntries) {
      // An entry with no resolvable date can't sit on a day row. It still
      // counts toward the scope totals above; it just has no column here.
      if (!e.date) continue;
      const dateKey = e.date;
      const sid = e.scope_item_id;
      const qty = Number(e.quantity_completed || 0);
      const target = sid ? targetById[sid] ?? 0 : 0;
      if (sid) {
        cumByScope[sid] = (cumByScope[sid] || 0) + qty;
      }
      const cumulative = sid ? cumByScope[sid] : qty;
      const cumPct = target > 0 ? parseFloat(Math.min(100, (cumulative / target) * 100).toFixed(1)) : 0;

      if (!entriesByDate[dateKey]) entriesByDate[dateKey] = [];
      entriesByDate[dateKey].push({
        id: e.id,
        scope_item_id: sid,
        description: e.description,
        // Show the operator's own words for the work; fall back to the target's.
        work_type: e.work_type,
        unit: e.unit,
        quantity_completed: qty,
        target_quantity: target,
        cumulative_quantity: cumulative,
        cumulative_pct: cumPct,
        operator_id: e.operator_id,
        operator_name: e.operator_id ? operatorNames[e.operator_id] ?? 'Unknown' : 'Unknown',
        notes: e.notes,
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

      // The day's hours come from the CLOCK CARD (see the timecard fetch above).
      // `net_hours` is the payroll figure (gross minus lunch); `total_hours` is
      // the older column; otherwise measure clock-out minus clock-in. A card
      // still open (no clock-out) contributes nothing rather than counting to
      // now — an un-clocked-out card is what produced "213 hours" elsewhere.
      const clockHours = tcs.reduce((s: number, t: any) => {
        // A stated ZERO is not an answer. Two production cards carry
        // `net_hours = 0` against a real 9–10 hour span (a gross-hours
        // miscalculation upstream); `??` would have let that zero win over a
        // perfectly good `total_hours` and printed the very 0.00 the founder
        // complained about. Take the first POSITIVE figure, then measure.
        const stated = [t.net_hours, t.total_hours]
          .map(Number)
          .find((v) => Number.isFinite(v) && v > 0);
        if (stated !== undefined) return s + stated;
        if (t.clock_in_time && t.clock_out_time) {
          const mins =
            (new Date(t.clock_out_time).getTime() - new Date(t.clock_in_time).getTime()) / 60000;
          if (mins > 0) return s + mins / 60;
        }
        return s;
      }, 0);
      const loggedHours = logs.reduce((s, l) => s + Number(l.hours_worked || 0), 0);
      // Fall back to the operator-entered hours only when nobody clocked in
      // that day, so a day is never silently blank.
      const hours = clockHours > 0 ? Math.round(clockHours * 100) / 100 : loggedHours;
      // Say where the number came from, so the panel can be honest instead of
      // printing a guess with the same authority as a measurement.
      const hoursSource: 'clock' | 'logged' | 'split_day' =
        clockHours > 0 ? 'clock' : unattributableDates.has(date) ? 'split_day' : 'logged';

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
        hours_source: hoursSource,
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
        overall_pct: loaded.overall_pct,
        unmatched_work: loaded.unmatched_work,
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
