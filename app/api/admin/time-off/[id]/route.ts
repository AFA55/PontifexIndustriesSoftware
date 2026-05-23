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

    // Load the request first so we have dates / type / operator for timecard sync.
    const { data: record } = await supabaseAdmin
      .from('operator_time_off')
      .select('operator_id, date, end_date, type, is_paid, tenant_id')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single();

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

    // ─── Timecard sync ──────────────────────────────────────────────
    // Marker used to identify rows this flow created, so reversal only
    // deletes our auto-rows and never real punches.
    const AUTO_MARKER = `[AUTO-TIMEOFF:${id}]`;

    if (record) {
      const userId = record.operator_id;
      const recTenant = record.tenant_id || tenantId;
      // Build inclusive list of YYYY-MM-DD days in [date, end_date].
      const days: string[] = [];
      const start = new Date(`${record.date}T00:00:00Z`);
      const end = new Date(`${record.end_date || record.date}T00:00:00Z`);
      for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
        days.push(d.toISOString().slice(0, 10));
      }

      if (status === 'approved') {
        // Paid types get 8h PTO; unpaid gets a 0h time_off marker.
        const paidTypes = ['pto', 'vacation', 'personal_day', 'holiday'];
        const isPaid =
          record.is_paid === true ||
          (record.is_paid == null && paidTypes.includes((record.type || '').toLowerCase()));
        const entryType = isPaid ? 'pto' : 'time_off';
        const hours = isPaid ? 8 : 0;
        const noteLabel = isPaid ? 'Approved time off (PTO)' : 'Approved time off (UPTO — unpaid)';

        // Find days that already have a timecard to avoid duplicates.
        const { data: existing } = await supabaseAdmin
          .from('timecards')
          .select('date')
          .eq('user_id', userId)
          .eq('tenant_id', recTenant)
          .in('date', days);
        const taken = new Set((existing || []).map((r: { date: string }) => r.date));

        const rows = days
          .filter((d) => !taken.has(d))
          .map((d) => ({
            user_id: userId,
            tenant_id: recTenant,
            date: d,
            total_hours: hours,
            net_hours: hours,
            regular_hours: hours,
            entry_type: entryType,
            timecard_source: 'manual',
            is_approved: true,
            approved_by: auth.userId,
            approved_at: new Date().toISOString(),
            approval_status: 'manually_approved',
            notes: `${noteLabel} ${AUTO_MARKER}`,
          }));

        if (rows.length > 0) {
          const { error: tcError } = await supabaseAdmin.from('timecards').insert(rows);
          if (tcError) {
            console.error('PATCH /api/admin/time-off/[id] timecard insert error:', tcError);
            return NextResponse.json(
              { error: 'Approved, but failed to create timecard entries' },
              { status: 500 }
            );
          }
        }
      } else if (status === 'denied' || status === 'cancelled') {
        // Reversal: best-effort remove ONLY rows we created (matched by marker).
        Promise.resolve(
          supabaseAdmin
            .from('timecards')
            .delete()
            .eq('user_id', userId)
            .eq('tenant_id', recTenant)
            .in('date', days)
            .ilike('notes', `%${AUTO_MARKER}%`)
        )
          .then((res: any) => { if (res.error) console.error('Timecard cleanup error:', res.error); })
          .catch(() => {});
      }
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
