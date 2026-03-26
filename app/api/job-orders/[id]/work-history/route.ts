/**
 * API Route: GET /api/job-orders/[id]/work-history
 * Fetch all daily_job_logs and work_items for a job order.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;

    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    // Fetch daily job logs
    const { data: logs, error: logsError } = await supabaseAdmin
      .from('daily_job_logs')
      .select('*')
      .eq('job_order_id', jobId)
      .order('day_number', { ascending: true });

    if (logsError) {
      console.error('Error fetching daily job logs:', logsError);
      // Table may not exist — return empty
      return NextResponse.json({ success: true, data: { logs: [], work_items: [] } });
    }

    // Fetch work items
    const { data: workItems, error: wiError } = await supabaseAdmin
      .from('work_items')
      .select('*')
      .eq('job_order_id', jobId)
      .order('created_at', { ascending: true });

    if (wiError) {
      console.error('Error fetching work items:', wiError);
    }

    return NextResponse.json({
      success: true,
      data: {
        logs: logs || [],
        work_items: workItems || [],
      },
    });
  } catch (error) {
    console.error('Unexpected error in GET /api/job-orders/[id]/work-history:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
