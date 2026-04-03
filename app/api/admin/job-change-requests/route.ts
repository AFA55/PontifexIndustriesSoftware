export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;

  let query = supabaseAdmin
    .from('schedule_change_requests')
    .select(
      `*, job_orders(title, job_number), requester:profiles!requested_by(full_name)`
    )
    .eq('tenant_id', auth.tenantId)
    .order('created_at', { ascending: false });

  // Non-super-admins only see their own requests
  if (!['super_admin', 'operations_manager'].includes(auth.role || '')) {
    query = query.eq('requested_by', auth.userId);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;

  const body = (await request.json()) as {
    jobId: string;
    requestType: string;
    currentValue?: string;
    requestedValue?: string;
    reason: string;
  };

  if (!body.jobId || !body.requestType || !body.reason) {
    return NextResponse.json(
      { error: 'jobId, requestType, and reason are required' },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from('schedule_change_requests')
    .insert({
      job_order_id: body.jobId,
      tenant_id: auth.tenantId,
      requested_by: auth.userId,
      request_type: body.requestType,
      current_value: body.currentValue,
      requested_value: body.requestedValue,
      reason: body.reason,
      description: body.reason,
      status: 'pending',
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Notify all super_admins and operations_managers in tenant — fire-and-forget
  Promise.resolve(
    (async () => {
      const { data: admins } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('tenant_id', auth.tenantId)
        .in('role', ['super_admin', 'operations_manager']);

      if (!admins?.length) return;

      const { data: job } = await supabaseAdmin
        .from('job_orders')
        .select('title, job_number')
        .eq('id', body.jobId)
        .single();

      const { data: requester } = await supabaseAdmin
        .from('profiles')
        .select('full_name')
        .eq('id', auth.userId)
        .single();

      const requesterName = requester?.full_name || auth.userEmail;

      const notifs = admins.map((admin) => ({
        user_id: admin.id,
        tenant_id: auth.tenantId,
        type: 'change_request',
        title: 'Schedule Change Request',
        message: `${requesterName} requested a change to job ${job?.job_number || ''}: ${body.reason}`,
        action_url: `/dashboard/admin/jobs/${body.jobId}`,
        is_read: false,
      }));

      await supabaseAdmin.from('notifications').insert(notifs);
    })()
  ).catch(() => {});

  return NextResponse.json({ success: true, data });
}
