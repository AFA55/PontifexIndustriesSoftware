export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;

  if (!['super_admin', 'operations_manager'].includes(auth.role || '')) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  const { id } = await params;
  const { status, reviewNotes } = (await request.json()) as {
    status: 'approved' | 'rejected';
    reviewNotes?: string;
  };

  if (!['approved', 'rejected'].includes(status)) {
    return NextResponse.json({ error: 'status must be approved or rejected' }, { status: 400 });
  }

  // Fetch the change request
  const { data: cr, error: fetchError } = await supabaseAdmin
    .from('schedule_change_requests')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)
    .single();

  if (fetchError || !cr) {
    return NextResponse.json({ error: 'Change request not found' }, { status: 404 });
  }

  // Update status
  const { error: updateError } = await supabaseAdmin
    .from('schedule_change_requests')
    .update({
      status,
      reviewed_by: auth.userId,
      review_notes: reviewNotes,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (updateError) {
    console.error('Error updating change request status:', updateError);
    return NextResponse.json({ error: 'Failed to update change request' }, { status: 500 });
  }

  // If approved and it's a date_extension, apply the change
  if (status === 'approved' && cr.request_type === 'date_extension' && cr.requested_value) {
    await supabaseAdmin
      .from('job_orders')
      .update({
        scheduled_end_date: cr.requested_value,
        end_date: cr.requested_value,
      })
      .eq('id', cr.job_order_id);
  }

  // Notify the requester — fire-and-forget
  Promise.resolve(
    supabaseAdmin.from('notifications').insert({
      user_id: cr.requested_by,
      tenant_id: auth.tenantId,
      type: 'change_request_reviewed',
      title: `Change Request ${status === 'approved' ? 'Approved' : 'Rejected'}`,
      message:
        reviewNotes ||
        `Your schedule change request was ${status}.`,
      action_url: `/dashboard/admin/jobs/${cr.job_order_id}`,
      is_read: false,
    })
  ).catch(() => {});

  return NextResponse.json({ success: true });
}
