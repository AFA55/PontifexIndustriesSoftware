export const dynamic = 'force-dynamic';

/**
 * /api/operator/time-off — employee time-off REQUESTS (every role can request).
 *
 * GET    — list the authenticated user's own requests (newest first).
 * POST   — submit a new request → status 'pending', awaiting approval.
 *          Body: { startDate, endDate, type: 'vacation'|'pto'|'unpaid', reason }
 *          422 + error_code 'advance_notice_required' when < 28 days out.
 * PATCH  — edit OWN still-pending request (dates/type/reason). Sets edited_at
 *          so approvers see it changed; stays pending for re-approval.
 *          Body: { id, startDate, endDate, type, reason }
 * DELETE — cancel OWN still-pending request. Query: ?id=
 *
 * Data model: ONE row per request — `date` = first day, `end_date` = last day
 * (NULL for single-day). Approval/denial happens in /api/admin/time-off/[id].
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, isTableNotFoundError } from '@/lib/api-auth';
import { sendPushToUser } from '@/lib/send-push';
import { toLocalYMD } from '@/lib/dates';
import {
  REQUESTABLE_TYPES,
  RequestableType,
  MANAGEMENT_REQUESTER_ROLES,
  ADVANCE_NOTICE_DAYS,
  businessDaysBetween,
  YMD_RE,
} from '@/lib/time-off';

const SELECT_FIELDS =
  'id, date, end_date, type, request_type, is_paid, pay_override, status, notes, pto_days_used, edited_at, approved_at, created_at';

interface ValidatedBody {
  startDate: string;
  endDate: string;
  type: RequestableType;
  reason: string;
}

/** Validate the request body. Returns an error response or the parsed values. */
function validateBody(body: any): { error: NextResponse } | { values: ValidatedBody } {
  const startDate: string = body.startDate;
  const endDate: string = body.endDate || body.startDate;
  const type: string = body.type;
  const reason: string = (body.reason || '').trim();

  if (!startDate || !YMD_RE.test(startDate) || !YMD_RE.test(endDate)) {
    return {
      error: NextResponse.json(
        { error: 'startDate and endDate must be YYYY-MM-DD strings' },
        { status: 400 }
      ),
    };
  }
  if (endDate < startDate) {
    return {
      error: NextResponse.json({ error: 'End date must be on or after start date' }, { status: 400 }),
    };
  }
  if (!REQUESTABLE_TYPES.includes(type as RequestableType)) {
    return {
      error: NextResponse.json(
        { error: `type must be one of: ${REQUESTABLE_TYPES.join(', ')}` },
        { status: 400 }
      ),
    };
  }
  if (!reason) {
    return { error: NextResponse.json({ error: 'Reason is required' }, { status: 400 }) };
  }

  // 4-week advance-notice business rule (server-side; the page handles 422)
  const earliest = new Date();
  earliest.setDate(earliest.getDate() + ADVANCE_NOTICE_DAYS);
  const earliestYMD = toLocalYMD(earliest);
  if (startDate < earliestYMD) {
    return {
      error: NextResponse.json(
        {
          error: `Time-off requests must be submitted at least ${ADVANCE_NOTICE_DAYS} days in advance.`,
          error_code: 'advance_notice_required',
          earliest_date: earliestYMD,
        },
        { status: 422 }
      ),
    };
  }

  return { values: { startDate, endDate, type: type as RequestableType, reason } };
}

/** True if the user has another active (pending/approved) entry overlapping the range. */
async function hasOverlap(
  userId: string,
  startDate: string,
  endDate: string,
  excludeId?: string
): Promise<boolean> {
  // Overlap test: row.date <= range.end AND coalesce(row.end_date, row.date) >= range.start
  let query = supabaseAdmin
    .from('operator_time_off')
    .select('id, status')
    .eq('operator_id', userId)
    .lte('date', endDate)
    .or(`end_date.gte.${startDate},and(end_date.is.null,date.gte.${startDate})`);
  if (excludeId) query = query.neq('id', excludeId);
  const { data } = await query;
  // NULL status = legacy row, treated as approved.
  return (data || []).some((r: any) => !['denied', 'cancelled'].includes(r.status ?? 'approved'));
}

/** Notify the right approvers of a new/edited request (fire-and-forget). */
function notifyApprovers(
  tenantId: string | null,
  requesterId: string,
  requesterRole: string,
  values: ValidatedBody,
  edited: boolean
) {
  if (!tenantId) return;
  void (async () => {
    try {
      const { data: requester } = await supabaseAdmin
        .from('profiles')
        .select('full_name')
        .eq('id', requesterId)
        .single();
      const name = requester?.full_name ?? 'An employee';
      const label = values.type === 'unpaid' ? 'Unpaid' : values.type === 'pto' ? 'PTO' : 'Vacation';
      const range =
        values.startDate === values.endDate
          ? values.startDate
          : `${values.startDate} – ${values.endDate}`;
      const title = edited ? 'Time-Off Request Edited' : 'New Time-Off Request';
      const msg = `${name} ${edited ? 'edited their' : 'requested'} ${label} time off for ${range} — ${values.reason}`;

      // Management requesters can only be decided by super_admin → notify only them.
      const approverRoles = MANAGEMENT_REQUESTER_ROLES.includes(requesterRole)
        ? ['super_admin']
        : ['admin', 'super_admin', 'operations_manager'];

      const { data: approvers } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .in('role', approverRoles)
        .or(`tenant_id.eq.${tenantId},tenant_id.is.null`);

      const targets = (approvers || []).filter((a: { id: string }) => a.id !== requesterId);
      if (targets.length === 0) return;

      const notifRows = targets.map((a: { id: string }) => ({
        user_id: a.id,
        tenant_id: tenantId,
        type: 'info',
        notification_type: 'time_off_request',
        title,
        message: msg,
        action_url: '/dashboard/admin/time-off',
        related_entity_type: 'operator_time_off',
        read: false,
        is_read: false,
      }));
      await supabaseAdmin.from('notifications').insert(notifRows);
      for (const a of targets) {
        sendPushToUser(a.id, {
          title,
          body: msg,
          data: { route: '/dashboard/admin/time-off' },
        }).catch(() => {});
      }
    } catch {
      /* non-fatal */
    }
  })();
}

// ─── GET: my requests ────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { data, error } = await supabaseAdmin
      .from('operator_time_off')
      .select(SELECT_FIELDS)
      .eq('operator_id', auth.userId)
      .order('date', { ascending: false })
      .limit(100);

    if (error) {
      if (isTableNotFoundError(error)) {
        return NextResponse.json({ success: true, data: [] });
      }
      console.error('GET /api/operator/time-off error:', error);
      return NextResponse.json({ error: 'Failed to fetch time-off requests' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (err) {
    console.error('Unexpected error GET /api/operator/time-off:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── POST: submit a new request ──────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const parsed = validateBody(body);
    if ('error' in parsed) return parsed.error;
    const values = parsed.values;

    if (await hasOverlap(auth.userId, values.startDate, values.endDate)) {
      return NextResponse.json(
        { error: 'You already have a pending or approved time-off entry overlapping these dates.' },
        { status: 409 }
      );
    }

    const isPaid = values.type !== 'unpaid';
    const row = {
      operator_id: auth.userId,
      tenant_id: auth.tenantId || null,
      date: values.startDate,
      end_date: values.endDate !== values.startDate ? values.endDate : null,
      type: values.type,
      request_type: values.type,
      is_paid: isPaid,
      is_callout: false,
      pto_days_used: isPaid ? businessDaysBetween(values.startDate, values.endDate) : 0,
      status: 'pending',
      notes: values.reason,
      created_by: auth.userId,
    };

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('operator_time_off')
      .insert(row)
      .select(SELECT_FIELDS)
      .single();

    if (insertError) {
      if (isTableNotFoundError(insertError)) {
        return NextResponse.json({ error: 'Time-off system is not available yet.' }, { status: 503 });
      }
      console.error('POST /api/operator/time-off insert error:', insertError);
      return NextResponse.json({ error: 'Failed to submit time-off request' }, { status: 500 });
    }

    notifyApprovers(auth.tenantId, auth.userId, auth.role, values, false);

    return NextResponse.json({ success: true, data: inserted }, { status: 201 });
  } catch (err) {
    console.error('Unexpected error POST /api/operator/time-off:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── PATCH: edit own pending request ─────────────────────────────────────────

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const id: string = body.id;
    if (!id) return NextResponse.json({ error: 'Missing required field: id' }, { status: 400 });

    const parsed = validateBody(body);
    if ('error' in parsed) return parsed.error;
    const values = parsed.values;

    // Ownership + lifecycle guard: only YOUR OWN PENDING request is editable.
    const { data: existing } = await supabaseAdmin
      .from('operator_time_off')
      .select('id, operator_id, status')
      .eq('id', id)
      .maybeSingle();

    if (!existing || existing.operator_id !== auth.userId) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }
    if (existing.status !== 'pending') {
      return NextResponse.json(
        { error: 'Only pending requests can be edited. Contact your supervisor to change a decided request.' },
        { status: 409 }
      );
    }

    if (await hasOverlap(auth.userId, values.startDate, values.endDate, id)) {
      return NextResponse.json(
        { error: 'You already have a pending or approved time-off entry overlapping these dates.' },
        { status: 409 }
      );
    }

    const isPaid = values.type !== 'unpaid';
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('operator_time_off')
      .update({
        date: values.startDate,
        end_date: values.endDate !== values.startDate ? values.endDate : null,
        type: values.type,
        request_type: values.type,
        is_paid: isPaid,
        pto_days_used: isPaid ? businessDaysBetween(values.startDate, values.endDate) : 0,
        notes: values.reason,
        status: 'pending', // edit resets for re-approval
        pay_override: null,
        approved_by: null,
        approved_at: null,
        edited_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('operator_id', auth.userId)
      .select(SELECT_FIELDS)
      .single();

    if (updateError) {
      console.error('PATCH /api/operator/time-off update error:', updateError);
      return NextResponse.json({ error: 'Failed to update time-off request' }, { status: 500 });
    }

    notifyApprovers(auth.tenantId, auth.userId, auth.role, values, true);

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    console.error('Unexpected error PATCH /api/operator/time-off:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── DELETE: cancel own pending request ──────────────────────────────────────

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const id = request.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing query param: id' }, { status: 400 });

    const { data: existing } = await supabaseAdmin
      .from('operator_time_off')
      .select('id, operator_id, status')
      .eq('id', id)
      .maybeSingle();

    if (!existing || existing.operator_id !== auth.userId) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }
    if (existing.status !== 'pending') {
      return NextResponse.json({ error: 'Only pending requests can be cancelled.' }, { status: 409 });
    }

    const { error } = await supabaseAdmin
      .from('operator_time_off')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('operator_id', auth.userId);

    if (error) {
      console.error('DELETE /api/operator/time-off error:', error);
      return NextResponse.json({ error: 'Failed to cancel request' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Unexpected error DELETE /api/operator/time-off:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
