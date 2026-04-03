export const dynamic = 'force-dynamic';

/**
 * API Route: GET /api/admin/customers/[id]/job-history
 * Returns recent job history for a customer.
 * Used by the smart schedule form for location/address suggestions.
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

    const { data: jobs, error } = await supabaseAdmin
      .from('job_orders')
      .select(
        'id, job_number, scheduled_date, location, address, status, po_number, customer_contact'
      )
      .eq('customer_id', customerId)
      .eq('tenant_id', auth.tenantId)
      .order('scheduled_date', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Error fetching job history:', error);
      return NextResponse.json({ success: true, data: [] });
    }

    const data = (jobs || []).map((job) => ({
      id: job.id as string,
      job_number: (job.job_number as string) || '',
      scheduled_date: (job.scheduled_date as string) || '',
      location: (job.location as string | null) || null,
      address: (job.address as string | null) || null,
      status: (job.status as string) || '',
      po_number: (job.po_number as string | null) || null,
      site_contact: (job.customer_contact as string | null) || null,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Unexpected error in job-history GET:', error);
    return NextResponse.json({ success: true, data: [] });
  }
}
