export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/timecards/late?start=YYYY-MM-DD&end=YYYY-MM-DD
 *
 * Returns timecards where is_late=true within the requested date range.
 * Defaults to the current Mon–Sun week when start/end are omitted.
 *
 * Each row is enriched with operator_name and operator_role from profiles.
 * Ordered by date desc, late_minutes desc.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';
import { toLocalYMD, mondayOf, parseYMDLocal } from '@/lib/dates';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const tenantId = auth.tenantId;
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant scope required' }, { status: 400 });
    }

    const params = request.nextUrl.searchParams;
    let start = params.get('start') ?? null;
    let end = params.get('end') ?? null;

    // Default to current Mon–Sun week when either param is missing.
    if (!start || !end) {
      const weekMonday = mondayOf(new Date());
      // Compute Sunday by adding 6 days to the Monday Date.
      const sundayDate = parseYMDLocal(weekMonday);
      sundayDate.setDate(sundayDate.getDate() + 6);
      start = weekMonday;
      end = toLocalYMD(sundayDate);
    }

    // Validate format if caller supplied values.
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRe.test(start) || !dateRe.test(end)) {
      return NextResponse.json(
        { error: 'start and end must be YYYY-MM-DD' },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('timecards')
      .select(
        'id, user_id, date, scheduled_start_time, late_minutes, late_source, clock_in_time, total_hours'
      )
      .eq('tenant_id', tenantId)
      .eq('is_late', true)
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: false })
      .order('late_minutes', { ascending: false });

    if (error) {
      console.error('Error fetching late timecards:', error);
      return NextResponse.json({ error: 'Failed to fetch late timecards' }, { status: 500 });
    }

    const rows = data || [];

    // Resolve operator names + roles in a single profiles query.
    const userIds = [...new Set(rows.map((r) => r.user_id as string).filter(Boolean))];

    let profileMap: Record<string, { full_name: string | null; role: string | null }> = {};
    if (userIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name, role')
        .eq('tenant_id', tenantId)
        .in('id', userIds);

      if (!profilesError && profiles) {
        profileMap = Object.fromEntries(
          profiles.map((p: { id: string; full_name: string | null; role: string | null }) => [
            p.id,
            { full_name: p.full_name, role: p.role },
          ])
        );
      }
    }

    // Map the stored enum (written by the clock-in resolution chain in
    // lib/timecard-start.ts) to a display label the UI badge renders directly.
    const LATE_SOURCE_LABEL: Record<string, string> = {
      job: 'Job',
      day_override: 'Day override',
      standard: 'Standard',
    };

    const enriched = rows.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      date: row.date,
      scheduled_start_time: row.scheduled_start_time,
      late_minutes: row.late_minutes,
      late_source: LATE_SOURCE_LABEL[row.late_source as string] ?? 'Standard',
      clock_in_time: row.clock_in_time,
      total_hours: row.total_hours,
      operator_name: profileMap[row.user_id]?.full_name ?? null,
      operator_role: profileMap[row.user_id]?.role ?? null,
    }));

    return NextResponse.json({ success: true, data: enriched });
  } catch (err) {
    console.error('Unexpected error in late timecards GET:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
