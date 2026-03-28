/**
 * API Route: POST /api/admin/job-orders/[id]/approve
 * Super admin approves a pending schedule form submission.
 *
 * Body: { scheduled_date?, is_will_call? }
 * - Sets status to 'scheduled'
 * - Clears rejection fields
 * - Creates schedule_form_submissions entry (action: 'approved')
 * - Creates schedule_notifications for the form submitter (type: 'approved')
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireSuperAdmin } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const auth = await requireSuperAdmin(request);
    if (!auth.authorized) return auth.response;

    const tenantId = await getTenantId(auth.userId);
    const body = await request.json();
    const { scheduled_date, is_will_call } = body;

    // Fetch the job order
    let jobQuery = supabaseAdmin
      .from('job_orders')
      .select('*, profiles:created_by(id, full_name, email)')
      .eq('id', id);
    if (tenantId) { jobQuery = jobQuery.eq('tenant_id', tenantId); }
    const { data: jobOrder, error: fetchError } = await jobQuery.single();

    if (fetchError || !jobOrder) {
      return NextResponse.json({ error: 'Job order not found' }, { status: 404 });
    }

    if (!['pending_approval', 'rejected'].includes(jobOrder.status)) {
      return NextResponse.json(
        { error: `Cannot approve a job with status '${jobOrder.status}'.` },
        { status: 400 }
      );
    }

    // Get approver profile
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('full_name')
      .eq('id', auth.userId)
      .single();

    const approverName = profile?.full_name || auth.userEmail;

    // Update job order to scheduled
    const updateData: Record<string, any> = {
      status: 'scheduled',
      rejection_reason: null,
      rejection_notes: null,
      rejected_by: null,
      rejected_at: null,
      updated_at: new Date().toISOString(),
    };

    if (scheduled_date) {
      updateData.scheduled_date = scheduled_date;
    }
    if (typeof is_will_call === 'boolean') {
      updateData.is_will_call = is_will_call;
    }

    const { data: updatedJob, error: updateError } = await supabaseAdmin
      .from('job_orders')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Error approving job order:', updateError);
      return NextResponse.json({ error: 'Failed to approve job order' }, { status: 500 });
    }

    // Create schedule_form_submissions entry
    Promise.resolve(
      supabaseAdmin.from('schedule_form_submissions').insert({
        job_order_id: id,
        submitted_by: auth.userId,
        submitted_by_name: approverName,
        action: 'approved',
        notes: `Approved by ${approverName}`,
        form_snapshot: updatedJob,
      })
    ).catch(() => {});

    // Create notification for the form submitter
    const submitterId = jobOrder.created_by;
    if (submitterId) {
      const dateMsg = updatedJob.scheduled_date
        ? ` Scheduled for ${new Date(updatedJob.scheduled_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}.`
        : '';

      Promise.resolve(
        supabaseAdmin.from('schedule_notifications').insert({
          recipient_id: submitterId,
          recipient_name: jobOrder.profiles?.full_name || null,
          job_order_id: id,
          type: 'approved',
          title: `Approved: ${jobOrder.job_number} — ${jobOrder.customer_name}`,
          message: `Approved by ${approverName}.${dateMsg}`,
          metadata: {
            approved_by_name: approverName,
            scheduled_date: updatedJob.scheduled_date,
          },
        })
      ).catch(() => {});
    }

    // Audit log (fire-and-forget)
    Promise.resolve(
      supabaseAdmin.from('job_orders_history').insert({
        job_order_id: id,
        job_number: jobOrder.job_number,
        changed_by: auth.userId,
        changed_by_name: approverName,
        changed_by_role: 'super_admin',
        change_type: 'approved',
        changes: {
          status: { old: jobOrder.status, new: 'scheduled' },
        },
        snapshot: updatedJob,
      })
    ).catch(() => {});

    return NextResponse.json({
      success: true,
      message: `Job ${jobOrder.job_number} approved`,
      data: updatedJob,
    });
  } catch (error: any) {
    console.error('Unexpected error in approve route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
