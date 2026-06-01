export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/jobs/[id]/helper-logs
 * Returns the helper (apprentice) work logs for a job — what each helper said they did.
 * Separate from the operator's work-performed ticket. Available for active AND completed
 * jobs so management always sees the operator ticket + what the apprentice contributed.
 * Auth: schedule-board access (admin / super_admin / operations_manager / supervisor).
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireScheduleBoardAccess } from '@/lib/api-auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireScheduleBoardAccess(request);
    if (!auth.authorized) return auth.response;

    const { id: jobOrderId } = await params;

    const { data, error } = await supabaseAdmin
      .from('helper_work_logs')
      .select('id, helper_id, work_description, log_date, started_at, completed_at, hours_worked, helper:helper_id ( full_name )')
      .eq('job_order_id', jobOrderId)
      .order('log_date', { ascending: false });

    if (error) {
      console.error('admin/jobs/[id]/helper-logs GET error:', error);
      return NextResponse.json({ error: 'Failed to load helper logs', details: error.message }, { status: 500 });
    }

    const logs = (data || []).map((l: any) => ({
      id: l.id,
      helper_id: l.helper_id,
      helper_name: l.helper?.full_name ?? 'Helper',
      work_description: l.work_description ?? '',
      log_date: l.log_date,
      hours_worked: l.hours_worked,
      completed: !!l.completed_at,
    }));

    return NextResponse.json({ success: true, data: logs });
  } catch (error) {
    console.error('Unexpected error in GET /api/admin/jobs/[id]/helper-logs:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
