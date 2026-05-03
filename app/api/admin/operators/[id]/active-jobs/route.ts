export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/operators/[id]/active-jobs?date=YYYY-MM-DD
 *
 * Returns the operator's active jobs for the given date (defaults to today).
 * Used by the supervisor site-visit form to populate the job-select after
 * picking an operator.
 *
 * "Active for date" = job's [scheduled_date, end_date|scheduled_date] window
 * covers the date AND status is in {scheduled, in_progress, en_route}.
 * Status 'completed' / 'cancelled' are excluded.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';

const ALLOWED = new Set(['supervisor', 'admin', 'super_admin', 'operations_manager', 'salesman']);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;
  if (!ALLOWED.has(auth.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: operatorId } = await params;
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Invalid date format. Use YYYY-MM-DD.' }, { status: 400 });
  }

  // Verify operator is in same tenant
  const { data: opProfile } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name, tenant_id, role')
    .eq('id', operatorId)
    .single();

  if (!opProfile) {
    return NextResponse.json({ error: 'Operator not found' }, { status: 404 });
  }
  if (auth.role !== 'super_admin' && opProfile.tenant_id !== auth.tenantId) {
    return NextResponse.json({ error: 'Operator outside your tenant' }, { status: 403 });
  }

  // Pull jobs assigned to this operator (as primary or helper) where the date
  // falls within the schedule window.
  let query = supabaseAdmin
    .from('job_orders')
    .select('id, job_number, customer_name, status, scheduled_date, end_date, address, location, job_type, assigned_to, helper_assigned_to')
    .or(`assigned_to.eq.${operatorId},helper_assigned_to.eq.${operatorId}`)
    .lte('scheduled_date', date)
    .order('scheduled_date', { ascending: true });

  if (auth.role !== 'super_admin' && auth.tenantId) {
    query = query.eq('tenant_id', auth.tenantId);
  }

  const { data: rows, error } = await query;
  if (error) {
    console.error('operator active-jobs error:', error);
    return NextResponse.json({ error: 'Failed to load jobs' }, { status: 500 });
  }

  // Filter end_date >= date (or end_date null with scheduled_date == date) + status filter
  const activeStatuses = new Set(['scheduled', 'in_progress', 'en_route']);
  const jobs = (rows ?? []).filter((j) => {
    if (!activeStatuses.has(j.status)) return false;
    const end = j.end_date || j.scheduled_date;
    if (!end) return j.scheduled_date === date;
    return end >= date;
  });

  return NextResponse.json({
    success: true,
    data: {
      operator: { id: opProfile.id, full_name: opProfile.full_name, role: opProfile.role },
      date,
      jobs,
    },
  });
}
