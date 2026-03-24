/**
 * POST /api/admin/schedule-board/missing-info
 * Request missing info on a pending job — updates job status and creates notification
 * Access: super_admin only
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireSuperAdmin } from '@/lib/api-auth';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireSuperAdmin(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const { jobId, missingItems, customNote } = body;

    if (!jobId) {
      return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
    }
    if (!missingItems || missingItems.length === 0) {
      return NextResponse.json({ error: 'At least one missing item is required' }, { status: 400 });
    }

    // Fetch the job to get submitter info
    const { data: job, error: jobError } = await supabaseAdmin
      .from('job_orders')
      .select('id, customer_name, salesman_name, created_by')
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Update job with missing info details and flag status
    const { error: updateError } = await supabaseAdmin
      .from('job_orders')
      .update({
        missing_info_items: missingItems,
        missing_info_note: customNote || null,
        missing_info_flagged: true,
        missing_info_flagged_by: auth.userId,
        missing_info_flagged_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    if (updateError) {
      console.error('Error updating job missing info:', updateError);
      return NextResponse.json({ error: 'Failed to update job' }, { status: 500 });
    }

    // Create notification for the submitter
    if (job.created_by) {
      await supabaseAdmin.from('schedule_notifications').insert({
        recipient_id: job.created_by,
        recipient_name: job.salesman_name || null,
        job_order_id: jobId,
        type: 'missing_info',
        title: `Missing Info: ${job.customer_name}`,
        message: `Please provide: ${missingItems.join(', ')}${customNote ? `. Note: ${customNote}` : ''}`,
        metadata: { missing_items: missingItems, custom_note: customNote },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Unexpected error in missing-info:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
