export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/schedule-board
 * Fetch schedule board data for a given date range.
 * Pending jobs are ALWAYS fetched regardless of date (global queue).
 * Access: admin, super_admin, salesman
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireScheduleBoardAccess } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireScheduleBoardAccess(request);
    if (!auth.authorized) return auth.response;

    const tenantId = await getTenantId(auth.userId);

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date'); // YYYY-MM-DD
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // 1. Fetch scheduled jobs filtered by date
    let query = supabaseAdmin
      .from('schedule_board_view')
      .select('*')
      .neq('status', 'pending_approval')
      .order('arrival_time', { ascending: true, nullsFirst: false });

    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    }

    if (date) {
      // Show a job on a given date if it starts on or before that date
      // AND has no end_date OR its end_date is on or after that date.
      // This makes multi-day jobs appear on every day in their span.
      query = query.lte('scheduled_date', date).or(`end_date.is.null,end_date.gte.${date}`);
    } else if (startDate && endDate) {
      query = query.gte('scheduled_date', startDate).lte('scheduled_date', endDate);
    } else {
      const today = new Date().toISOString().split('T')[0];
      query = query.lte('scheduled_date', today).or(`end_date.is.null,end_date.gte.${today}`);
    }

    const { data: jobs, error } = await query;

    if (error) {
      console.error('Error fetching schedule board:', error);
      return NextResponse.json({ error: 'Failed to fetch schedule data' }, { status: 500 });
    }

    // 2. Fetch ALL pending_approval jobs (not date-filtered — global queue)
    let pendingQuery = supabaseAdmin
      .from('schedule_board_view')
      .select('*')
      .eq('status', 'pending_approval')
      .order('created_at', { ascending: false });
    if (tenantId) { pendingQuery = pendingQuery.eq('tenant_id', tenantId); }
    const { data: pendingJobs, error: pendingError } = await pendingQuery;

    if (pendingError) {
      console.error('Error fetching pending jobs:', pendingError);
    }

    // 3. Fetch ALL will-call jobs (also global — not date-filtered)
    let wcQuery = supabaseAdmin
      .from('schedule_board_view')
      .select('*')
      .eq('is_will_call', true)
      .neq('status', 'pending_approval')
      .order('created_at', { ascending: false });
    if (tenantId) { wcQuery = wcQuery.eq('tenant_id', tenantId); }
    const { data: willCallJobs, error: wcError } = await wcQuery;

    if (wcError) {
      console.error('Error fetching will-call jobs:', wcError);
    }

    // Group date-filtered jobs
    const assigned: typeof jobs = [];
    const unassigned: typeof jobs = [];

    for (const job of jobs || []) {
      if (job.is_will_call) {
        continue; // will-call fetched separately
      } else if (job.assigned_to) {
        assigned.push(job);
      } else {
        unassigned.push(job);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        assigned,
        unassigned,
        pending: pendingJobs || [],
        willCall: willCallJobs || [],
        total: (jobs?.length || 0) + (pendingJobs?.length || 0) + (willCallJobs?.length || 0),
      },
      meta: {
        userRole: auth.role,
        canEdit: auth.role === 'super_admin',
      },
    });
  } catch (error) {
    console.error('Unexpected error in GET /api/admin/schedule-board:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
