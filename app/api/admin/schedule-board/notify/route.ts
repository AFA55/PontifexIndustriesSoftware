/**
 * POST /api/admin/schedule-board/notify
 * Create a notification for the job submitter.
 * Access: super_admin only
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireSuperAdmin } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireSuperAdmin(request);
    if (!auth.authorized) return auth.response;

    const tenantId = await getTenantId(auth.userId);
    const body = await request.json();
    const { jobId, type, title, message } = body;

    if (!jobId || !type || !title) {
      return NextResponse.json({ error: 'jobId, type, and title are required' }, { status: 400 });
    }

    // Fetch the job to get submitter info
    let jobQuery = supabaseAdmin
      .from('job_orders')
      .select('id, customer_name, salesman_name, created_by')
      .eq('id', jobId);
    if (tenantId) { jobQuery = jobQuery.eq('tenant_id', tenantId); }
    const { data: job } = await jobQuery.single();

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Create notification for submitter
    if (job.created_by) {
      const { error: notifError } = await supabaseAdmin.from('schedule_notifications').insert({
        recipient_id: job.created_by,
        recipient_name: job.salesman_name || null,
        job_order_id: jobId,
        type,
        title,
        message: message || null,
      });

      if (notifError) {
        console.error('Error creating notification:', notifError);
        return NextResponse.json({ error: 'Failed to create notification' }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Unexpected error in notify:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
