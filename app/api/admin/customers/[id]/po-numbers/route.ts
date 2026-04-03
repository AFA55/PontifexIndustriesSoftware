export const dynamic = 'force-dynamic';

/**
 * API Route: GET /api/admin/customers/[id]/po-numbers
 * Returns all unique PO numbers used by a customer across their job history.
 * Used by the smart schedule form for PO number suggestions.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id: customerId } = await params;

    if (!customerId) {
      return NextResponse.json({ error: 'Customer ID is required' }, { status: 400 });
    }

    // Fetch all jobs for this customer that have a non-empty PO number
    const { data: jobs, error } = await supabaseAdmin
      .from('job_orders')
      .select('po_number, job_number, scheduled_date')
      .eq('customer_id', customerId)
      .eq('tenant_id', auth.tenantId)
      .not('po_number', 'is', null)
      .neq('po_number', '')
      .order('scheduled_date', { ascending: false });

    if (error) {
      console.error('Error fetching PO numbers:', error);
      return NextResponse.json({ success: true, data: [] });
    }

    if (!jobs || jobs.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // Group by po_number — deduplicate and aggregate
    const poMap = new Map<string, { last_used: string; job_count: number; last_job_number: string }>();

    for (const job of jobs) {
      const po = job.po_number as string;
      const date = (job.scheduled_date as string) || '';
      const jobNum = (job.job_number as string) || '';

      if (!poMap.has(po)) {
        poMap.set(po, { last_used: date, job_count: 1, last_job_number: jobNum });
      } else {
        const existing = poMap.get(po)!;
        existing.job_count += 1;
        // Jobs are already ordered by scheduled_date DESC so first occurrence is most recent
        // but update defensively
        if (date > existing.last_used) {
          existing.last_used = date;
          existing.last_job_number = jobNum;
        }
      }
    }

    // Convert to array, sort by last_used DESC, limit 20
    const data = Array.from(poMap.entries())
      .map(([po_number, stats]) => ({
        po_number,
        last_used: stats.last_used,
        job_count: stats.job_count,
        last_job_number: stats.last_job_number,
      }))
      .sort((a, b) => b.last_used.localeCompare(a.last_used))
      .slice(0, 20);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Unexpected error in po-numbers GET:', error);
    return NextResponse.json({ success: true, data: [] });
  }
}
