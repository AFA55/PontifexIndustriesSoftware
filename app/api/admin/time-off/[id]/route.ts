export const dynamic = 'force-dynamic';

/**
 * API Route: /api/admin/time-off/[id]
 * PATCH – approve or deny a time-off request
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const tenantId = await getTenantId(auth.userId);
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant scope required' }, { status: 400 });
    }

    const { id } = await params;
    const body = await request.json();
    const { status } = body;

    if (!status || !['approved', 'denied', 'cancelled'].includes(status)) {
      return NextResponse.json(
        { error: 'status must be one of: approved, denied, cancelled' },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from('operator_time_off')
      .update({
        status,
        approved_by: auth.userId,
        approved_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('tenant_id', tenantId);

    if (error) {
      console.error('PATCH /api/admin/time-off/[id] error:', error);
      return NextResponse.json({ error: 'Failed to update time-off request' }, { status: 500 });
    }

    // Fire-and-forget: notify the operator of the decision
    if (status === 'approved' || status === 'denied') {
      Promise.resolve(
        (async () => {
          // Get the time-off record to find the operator and dates
          const { data: record } = await supabaseAdmin
            .from('operator_time_off')
            .select('operator_id, date, end_date, type, tenant_id')
            .eq('id', id)
            .single();

          if (!record) return;

          const startDateStr = record.date;
          const endDateStr = record.end_date || record.date;
          const typeLabel = record.type?.replace(/_/g, ' ') || 'time off';

          const isApproved = status === 'approved';
          const notification = {
            recipient_id: record.operator_id,
            type: isApproved ? 'time_off_approved' : 'time_off_denied',
            title: isApproved ? '✅ Time-Off Approved' : '❌ Time-Off Request Denied',
            message: isApproved
              ? `Your ${typeLabel} request from ${startDateStr} to ${endDateStr} has been approved.`
              : `Your ${typeLabel} request from ${startDateStr} to ${endDateStr} was not approved. Please contact your supervisor.`,
            tenant_id: record.tenant_id || tenantId,
            read: false,
            metadata: { request_id: id, status, request_type: record.type },
          };

          await supabaseAdmin.from('schedule_notifications').insert(notification);
        })()
      ).catch(() => {});
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Unexpected error PATCH /api/admin/time-off/[id]:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
