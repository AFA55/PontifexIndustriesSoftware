export const dynamic = 'force-dynamic';

/**
 * API Route: /api/admin/time-off/[id]
 * PATCH – approve / deny / cancel a time-off request.
 *
 * Body: { status: 'approved' | 'denied' | 'cancelled', pay_override?: 'unpaid' }
 *   pay_override: 'unpaid' — approve, but convert a paid request to UNPAID.
 *                 Only valid with status 'approved'. Visible to the requester.
 *
 * Approval rank rules (SERVER-ENFORCED):
 *   - Requester is management (admin, operations_manager, salesman, supervisor)
 *     → ONLY super_admin can decide.
 *   - All other requesters → admin, operations_manager, or super_admin.
 *
 * Side effects on approval:
 *   - Timecard sync: 8h 'pto' rows for paid days, 0h 'time_off' markers for unpaid.
 *   - operator_pto_balance debit for paid approvals (credited back when a
 *     previously-approved paid entry is later denied/cancelled).
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';
import { canDecideTimeOff, businessDaysBetween } from '@/lib/time-off';

const PAID_TYPES = ['pto', 'vacation', 'personal_day', 'holiday', 'bereavement'];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id } = await params;
    const body = await request.json();
    const { status, pay_override } = body;

    if (!status || !['approved', 'denied', 'cancelled'].includes(status)) {
      return NextResponse.json(
        { error: 'status must be one of: approved, denied, cancelled' },
        { status: 400 }
      );
    }
    if (pay_override != null && pay_override !== 'unpaid') {
      return NextResponse.json({ error: "pay_override must be 'unpaid' when provided" }, { status: 400 });
    }
    if (pay_override === 'unpaid' && status !== 'approved') {
      return NextResponse.json({ error: 'pay_override is only valid when approving' }, { status: 400 });
    }

    // Load the record FIRST (no tenant filter) so super_admin — who has no
    // tenant of their own — can decide management requests in any tenant.
    const { data: record } = await supabaseAdmin
      .from('operator_time_off')
      .select('id, operator_id, date, end_date, type, is_paid, status, pto_days_used, tenant_id')
      .eq('id', id)
      .maybeSingle();

    if (!record) {
      return NextResponse.json({ error: 'Time-off request not found' }, { status: 404 });
    }

    // Tenant scoping: non-super-admins may only act inside their own tenant.
    if (auth.role !== 'super_admin') {
      const tenantId = await getTenantId(auth.userId);
      if (!tenantId || record.tenant_id !== tenantId) {
        return NextResponse.json({ error: 'Time-off request not found' }, { status: 404 });
      }
    }
    const recTenant: string | null = record.tenant_id ?? null;

    // ─── Rank rules: who may decide this requester's request? ───────
    const { data: requesterProfile } = await supabaseAdmin
      .from('profiles')
      .select('role, full_name')
      .eq('id', record.operator_id)
      .maybeSingle();
    const requesterRole = requesterProfile?.role ?? 'operator';

    if (record.operator_id === auth.userId && auth.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'You cannot approve or deny your own time-off request.' },
        { status: 403 }
      );
    }
    if (!canDecideTimeOff(auth.role, requesterRole)) {
      return NextResponse.json(
        { error: 'Only a super admin can approve or deny time-off requests from management.' },
        { status: 403 }
      );
    }

    // ─── Status-transition guard ─────────────────────────────────────
    // Without this, a double-tap / stale tab re-approves an already-approved
    // request (double-debiting the PTO balance) or resurrects one the
    // requester already cancelled. Legacy rows have NULL status = approved.
    const currentStatus: string = record.status ?? 'approved';
    if (currentStatus === status) {
      return NextResponse.json(
        { error: `Request is already ${status}.` },
        { status: 409 }
      );
    }
    const ALLOWED_TRANSITIONS: Record<string, string[]> = {
      approved: ['pending'],                 // approve only from pending
      denied: ['pending', 'approved'],       // deny fresh, or reverse an approval
      cancelled: ['pending', 'approved'],    // cancel fresh, or reverse an approval
    };
    if (!ALLOWED_TRANSITIONS[status].includes(currentStatus)) {
      return NextResponse.json(
        { error: `Cannot mark a ${currentStatus} request as ${status}.` },
        { status: 409 }
      );
    }

    // Final pay outcome: an 'unpaid' override flips a paid request to unpaid.
    const wasPaidType = record.is_paid === true ||
      (record.is_paid == null && PAID_TYPES.includes((record.type || '').toLowerCase()));
    const finalIsPaid = status === 'approved' && pay_override === 'unpaid' ? false : wasPaidType;

    const { error } = await supabaseAdmin
      .from('operator_time_off')
      .update({
        status,
        is_paid: status === 'approved' ? finalIsPaid : wasPaidType,
        pay_override: status === 'approved' && pay_override === 'unpaid' ? 'unpaid' : null,
        approved_by: auth.userId,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      console.error('PATCH /api/admin/time-off/[id] error:', error);
      return NextResponse.json({ error: 'Failed to update time-off request' }, { status: 500 });
    }

    // ─── Timecard sync ──────────────────────────────────────────────
    // Marker used to identify rows this flow created, so reversal only
    // deletes our auto-rows and never real punches.
    const AUTO_MARKER = `[AUTO-TIMEOFF:${id}]`;

    const userId = record.operator_id;
    // Build inclusive list of YYYY-MM-DD days in [date, end_date].
    const days: string[] = [];
    {
      const start = new Date(`${record.date}T00:00:00Z`);
      const end = new Date(`${record.end_date || record.date}T00:00:00Z`);
      for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
        days.push(d.toISOString().slice(0, 10));
      }
    }

    if (status === 'approved') {
      const entryType = finalIsPaid ? 'pto' : 'time_off';
      const hours = finalIsPaid ? 8 : 0;
      const noteLabel = finalIsPaid
        ? 'Approved time off (PTO)'
        : pay_override === 'unpaid'
          ? 'Approved time off (converted to UNPAID by approver)'
          : 'Approved time off (UPTO — unpaid)';

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

      // PTO balance debit for paid approvals (fire-and-forget).
      if (finalIsPaid) {
        const debit = Number(record.pto_days_used) || businessDaysBetween(record.date, record.end_date || record.date);
        Promise.resolve(adjustPtoBalance(userId, recTenant, parseInt(record.date.slice(0, 4), 10), debit))
          .catch(() => {});
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

      // Credit back a previously-approved PAID entry's PTO debit.
      if (record.status === 'approved' && wasPaidType) {
        const credit = Number(record.pto_days_used) || businessDaysBetween(record.date, record.end_date || record.date);
        Promise.resolve(adjustPtoBalance(userId, recTenant, parseInt(record.date.slice(0, 4), 10), -credit))
          .catch(() => {});
      }
    }

    // Fire-and-forget: notify the requester of the decision
    if (status === 'approved' || status === 'denied') {
      Promise.resolve(
        (async () => {
          const startDateStr = record.date;
          const endDateStr = record.end_date || record.date;
          const typeLabel = record.type?.replace(/_/g, ' ') || 'time off';

          const isApproved = status === 'approved';
          const convertedToUnpaid = isApproved && pay_override === 'unpaid' && wasPaidType;
          const notification = {
            recipient_id: record.operator_id,
            type: isApproved ? 'time_off_approved' : 'time_off_denied',
            title: convertedToUnpaid
              ? '✅ Time-Off Approved (as Unpaid)'
              : isApproved
                ? '✅ Time-Off Approved'
                : '❌ Time-Off Request Denied',
            message: convertedToUnpaid
              ? `Your ${typeLabel} request from ${startDateStr} to ${endDateStr} was approved, but converted to UNPAID time off by your approver.`
              : isApproved
                ? `Your ${typeLabel} request from ${startDateStr} to ${endDateStr} has been approved.`
                : `Your ${typeLabel} request from ${startDateStr} to ${endDateStr} was not approved. Please contact your supervisor.`,
            tenant_id: recTenant,
            read: false,
            metadata: { request_id: id, status, request_type: record.type, pay_override: pay_override ?? null },
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Adjust operator_pto_balance.pto_days_used by `delta` (clamped at 0). */
async function adjustPtoBalance(
  operatorId: string,
  tenantId: string | null,
  year: number,
  delta: number
): Promise<void> {
  const { data: existing } = await supabaseAdmin
    .from('operator_pto_balance')
    .select('id, pto_days_used')
    .eq('operator_id', operatorId)
    .eq('year', year)
    .maybeSingle();

  if (existing) {
    await supabaseAdmin
      .from('operator_pto_balance')
      .update({
        pto_days_used: Math.max(0, (Number(existing.pto_days_used) || 0) + delta),
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
  } else if (delta > 0) {
    await supabaseAdmin.from('operator_pto_balance').insert({
      operator_id: operatorId,
      tenant_id: tenantId,
      year,
      pto_days_allocated: 10,
      pto_days_used: delta,
      callout_count: 0,
    });
  }
}
