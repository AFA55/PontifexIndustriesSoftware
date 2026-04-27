export const dynamic = 'force-dynamic';

/**
 * API Route: /api/admin/time-off/stats
 * GET ?operatorId=<uuid>&year=<yyyy>
 *
 * Returns per-operator time-off / callout stats:
 *   callout_count, pto_days_used, pto_days_allocated, pto_days_remaining,
 *   last_callout_date, recent_history (last 10 entries)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const tenantId = await getTenantId(auth.userId);
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant scope required' }, { status: 400 });
    }

    const sp = request.nextUrl.searchParams;
    const operatorId = sp.get('operatorId');
    const year = parseInt(sp.get('year') || String(new Date().getFullYear()), 10);

    // Fetch PTO balance from the balance table
    let balanceQuery = supabaseAdmin
      .from('operator_pto_balance')
      .select('operator_id, pto_days_allocated, pto_days_used, callout_count, updated_at')
      .eq('year', year)
      .eq('tenant_id', tenantId);

    if (operatorId) {
      balanceQuery = balanceQuery.eq('operator_id', operatorId);
    }

    const { data: balances, error: balErr } = await balanceQuery;
    if (balErr) {
      console.error('stats GET balance error:', balErr);
      return NextResponse.json({ error: 'Failed to fetch PTO balance data' }, { status: 500 });
    }

    // Compute stats from operator_time_off table for the year to supplement/verify balance table
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;

    let histQuery = supabaseAdmin
      .from('operator_time_off')
      .select('operator_id, date, end_date, type, request_type, is_callout, pto_days_used, is_paid, notes, created_at')
      .eq('tenant_id', tenantId)
      .gte('date', yearStart)
      .lte('date', yearEnd)
      .order('date', { ascending: false });

    if (operatorId) {
      histQuery = histQuery.eq('operator_id', operatorId);
    } else {
      histQuery = histQuery.limit(500);
    }

    const { data: history, error: histErr } = await histQuery;
    if (histErr) {
      console.error('stats GET history error:', histErr);
      return NextResponse.json({ error: 'Failed to fetch time-off history' }, { status: 500 });
    }

    const CALLOUT_TYPES = ['sick', 'callout', 'no_show', 'personal_day'];

    // Build stats by operator
    const statsMap: Record<string, {
      operator_id: string;
      callout_count: number;
      pto_days_used: number;
      pto_days_allocated: number;
      pto_days_remaining: number;
      last_callout_date: string | null;
      recent_history: unknown[];
    }> = {};

    // Seed from balance table
    for (const b of balances ?? []) {
      statsMap[b.operator_id] = {
        operator_id: b.operator_id,
        callout_count: b.callout_count ?? 0,
        pto_days_used: b.pto_days_used ?? 0,
        pto_days_allocated: b.pto_days_allocated ?? 10,
        pto_days_remaining: (b.pto_days_allocated ?? 10) - (b.pto_days_used ?? 0),
        last_callout_date: null,
        recent_history: [],
      };
    }

    // Enrich with live data from operator_time_off
    for (const entry of history ?? []) {
      const oid = entry.operator_id;
      if (!statsMap[oid]) {
        statsMap[oid] = {
          operator_id: oid,
          callout_count: 0,
          pto_days_used: 0,
          pto_days_allocated: 10,
          pto_days_remaining: 10,
          last_callout_date: null,
          recent_history: [],
        };
      }
      const s = statsMap[oid];

      if (entry.is_callout || CALLOUT_TYPES.includes(entry.type)) {
        if (!s.last_callout_date) s.last_callout_date = entry.date;
      }

      if (s.recent_history.length < 10) {
        s.recent_history.push({
          id: (entry as any).id,
          date: entry.date,
          end_date: entry.end_date,
          type: entry.request_type || entry.type,
          is_callout: entry.is_callout,
          is_paid: entry.is_paid,
          pto_days_used: entry.pto_days_used,
          notes: entry.notes,
          created_at: entry.created_at,
        });
      }
    }

    // Weekend days worked — query timecards for all operators in one shot
    const weekendMap: Record<string, number> = {};
    const allOperatorIds = Object.keys(statsMap);
    if (allOperatorIds.length > 0) {
      const { data: tcEntries } = await supabaseAdmin
        .from('timecards')
        .select('user_id, date')
        .in('user_id', allOperatorIds)
        .not('clock_out_time', 'is', null);
      for (const tc of tcEntries ?? []) {
        const dow = new Date(tc.date + 'T12:00:00').getDay();
        if (dow === 0 || dow === 6) {
          weekendMap[tc.user_id] = (weekendMap[tc.user_id] ?? 0) + 1;
        }
      }
    }

    // Resolve operator names
    const operatorIds = Object.keys(statsMap);
    const nameMap: Record<string, string> = {};
    if (operatorIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', operatorIds);
      for (const p of profiles ?? []) {
        nameMap[p.id] = p.full_name ?? 'Unknown';
      }
    }

    const result = Object.values(statsMap).map((s) => ({
      ...s,
      operator_name: nameMap[s.operator_id] ?? 'Unknown',
      pto_days_remaining: Math.max(0, s.pto_days_allocated - s.pto_days_used),
      weekend_days_worked: weekendMap[s.operator_id] ?? 0,
    }));

    // If operatorId was specified, return single object; otherwise return array
    if (operatorId) {
      return NextResponse.json({ success: true, data: result[0] ?? null });
    }

    return NextResponse.json({ success: true, data: result, year });
  } catch (err) {
    console.error('Unexpected error GET /api/admin/time-off/stats:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
