export const dynamic = 'force-dynamic';

/**
 * POST /api/timecard/request-time-off
 * Submit a time-off request for the authenticated operator.
 * Creates entries in operator_time_off table.
 *
 * Body:
 *   dates   — string[] of YYYY-MM-DD dates
 *   reason  — optional explanation
 *   type    — 'vacation' | 'sick' | 'personal' | 'pto' | 'unpaid'
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, isTableNotFoundError } from '@/lib/api-auth';

const VALID_TYPES = ['vacation', 'sick', 'personal', 'pto', 'unpaid'];

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const { dates, reason, type } = body;

    // Validate dates
    if (!Array.isArray(dates) || dates.length === 0) {
      return NextResponse.json(
        { error: 'dates must be a non-empty array of YYYY-MM-DD strings' },
        { status: 400 }
      );
    }

    for (const d of dates) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
        return NextResponse.json(
          { error: `Invalid date format: ${d}. Use YYYY-MM-DD.` },
          { status: 400 }
        );
      }
    }

    // Validate type
    const timeOffType = type || 'vacation';
    if (!VALID_TYPES.includes(timeOffType)) {
      return NextResponse.json(
        { error: `type must be one of: ${VALID_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    // Check for existing time-off on any of the requested dates
    const { data: existing } = await supabaseAdmin
      .from('operator_time_off')
      .select('date')
      .eq('operator_id', auth.userId)
      .in('date', dates);

    const existingDates = new Set((existing || []).map((e: any) => e.date));
    const newDates = dates.filter((d: string) => !existingDates.has(d));

    if (newDates.length === 0) {
      return NextResponse.json(
        { error: 'Time off already requested for all specified dates.' },
        { status: 409 }
      );
    }

    // Insert time-off entries
    const rows = newDates.map((date: string) => ({
      operator_id: auth.userId,
      date,
      type: timeOffType,
      notes: reason || null,
      tenant_id: auth.tenantId || null,
    }));

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('operator_time_off')
      .insert(rows)
      .select();

    if (insertError) {
      if (isTableNotFoundError(insertError)) {
        return NextResponse.json(
          { error: 'Time-off system is not available yet.' },
          { status: 503 }
        );
      }
      console.error('Error inserting time-off:', insertError);
      return NextResponse.json(
        { error: 'Failed to submit time-off request' },
        { status: 500 }
      );
    }

    const skippedCount = dates.length - newDates.length;

    return NextResponse.json({
      success: true,
      message: `Time off requested for ${newDates.length} day(s)${skippedCount > 0 ? ` (${skippedCount} already existed)` : ''}`,
      data: {
        entries: inserted || [],
        requestedDates: newDates,
        skippedDates: dates.filter((d: string) => existingDates.has(d)),
      },
    }, { status: 201 });
  } catch (error: unknown) {
    console.error('Unexpected error in request-time-off route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * GET /api/timecard/request-time-off
 * List the authenticated user's time-off entries.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    let query = supabaseAdmin
      .from('operator_time_off')
      .select('*')
      .eq('operator_id', auth.userId)
      .order('date', { ascending: true });

    if (startDate) query = query.gte('date', startDate);
    if (endDate) query = query.lte('date', endDate);

    const { data, error } = await query;

    if (error) {
      if (isTableNotFoundError(error)) {
        return NextResponse.json({ success: true, data: [] }, { status: 200 });
      }
      console.error('Error fetching time-off:', error);
      return NextResponse.json({ error: 'Failed to fetch time-off entries' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error: unknown) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
