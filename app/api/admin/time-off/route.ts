export const dynamic = 'force-dynamic';

/**
 * API Route: /api/admin/time-off
 * GET  – list time-off entries with optional filters (operatorId, type, startDate, endDate, status)
 * POST – create a new time-off / callout entry
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';
import { sendPushToUser } from '@/lib/send-push';
import {
  isAttendanceFactType,
  MANAGEMENT_NOTIFY_ROLES,
  APPROVER_NOTIFY_ROLES,
} from '@/lib/time-off';

// Canonical type list (matches DB constraint)
export const VALID_TYPES = [
  'pto', 'unpaid', 'worked_last_night', 'sick', 'callout',
  'vacation', 'bereavement', 'personal', 'other',
  'unavailable', 'personal_day', 'no_show',
] as const;

// Which types are paid by default
const PAID_BY_DEFAULT: string[] = ['pto', 'vacation', 'bereavement'];
// Which types count as callouts/attendance incidents
export const CALLOUT_TYPES: string[] = ['sick', 'callout', 'no_show', 'personal_day'];

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const tenantId = await getTenantId(auth.userId);
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant scope required' }, { status: 400 });
    }

    const sp = request.nextUrl.searchParams;
    const operatorId = sp.get('operatorId');
    const type = sp.get('type');
    const startDate = sp.get('startDate');
    const endDate = sp.get('endDate');
    const year = sp.get('year');
    const limit = parseInt(sp.get('limit') || '200', 10);

    let query = supabaseAdmin
      .from('operator_time_off')
      .select('id, operator_id, date, end_date, type, request_type, is_paid, pay_override, edited_at, is_callout, callout_reason, pto_days_used, status, notes, approved_by, approved_at, created_at')
      .eq('tenant_id', tenantId)
      .order('date', { ascending: false })
      .limit(limit);

    if (operatorId) query = query.eq('operator_id', operatorId);
    if (type) query = query.eq('type', type);
    // ?type=callout also matches is_callout flag for convenience
    if (type === 'callout') query = query.eq('is_callout', true);
    if (startDate) query = query.gte('date', startDate);
    if (endDate) query = query.lte('date', endDate);
    // Year filter: matches any day within the calendar year
    if (year && !startDate && !endDate) {
      query = query.gte('date', `${year}-01-01`).lte('date', `${year}-12-31`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('GET /api/admin/time-off error:', error);
      return NextResponse.json({ error: 'Failed to fetch time-off entries' }, { status: 500 });
    }

    // Resolve operator names + roles (role drives the management badge +
    // super_admin-only approval gating in the UI; enforced server-side in [id]).
    const operatorIds = [...new Set((data ?? []).map((e: any) => e.operator_id).filter(Boolean))];
    const nameMap: Record<string, string> = {};
    const roleMap: Record<string, string> = {};
    if (operatorIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name, role')
        .in('id', operatorIds);
      for (const p of profiles ?? []) {
        nameMap[p.id] = p.full_name ?? 'Unknown';
        roleMap[p.id] = p.role ?? 'operator';
      }
    }

    const entries = (data ?? []).map((e: any) => ({
      ...e,
      operator_name: nameMap[e.operator_id] ?? 'Unknown',
      operator_role: roleMap[e.operator_id] ?? 'operator',
    }));

    return NextResponse.json({ success: true, data: entries });
  } catch (err) {
    console.error('Unexpected error GET /api/admin/time-off:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const tenantId = await getTenantId(auth.userId);
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant scope required' }, { status: 400 });
    }

    const body = await request.json();
    // Support both old field names (operator_id/date/type) and new spec names (operatorId/requestType)
    const operator_id: string = body.operator_id || body.operatorId;
    const date: string = body.date;
    const end_date: string | undefined = body.end_date || body.endDate;
    // requestType (new spec) takes priority; fall back to type (legacy)
    const type: string = body.requestType || body.type || 'pto';
    const notes: string | undefined = body.notes;
    const is_paid: boolean | undefined = body.isPaid ?? body.is_paid;
    const reason: string | undefined = body.reason || body.callout_reason;

    if (!operator_id || !date) {
      return NextResponse.json(
        { error: 'Missing required fields: operator_id (or operatorId), date' },
        { status: 400 }
      );
    }

    if (!VALID_TYPES.includes(type as typeof VALID_TYPES[number])) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    // Determine paid status: use explicit override if provided, else default by type
    const paid = typeof is_paid === 'boolean' ? is_paid : PAID_BY_DEFAULT.includes(type);
    const isCallout = CALLOUT_TYPES.includes(type);

    // ── Behavior split by TYPE (founder's rule) ──────────────────────────
    // After-the-fact ATTENDANCE FACTS (callout / no_show) are NOT requests:
    //   record them IMMEDIATELY (status 'approved') + notify ALL management.
    // Planned TIME-OFF REQUESTS (everything else — vacation/sick/personal/…):
    //   land PENDING → rank-based approval, notify ONLY approvers (admin +
    //   super_admin). PTO debit happens on approval in PATCH, not here.
    const isAttendanceFact = isAttendanceFactType(type);

    // Calculate business days for PTO balance tracking
    const ptoDaysUsed = ['pto', 'vacation', 'bereavement', 'personal'].includes(type)
      ? calcBusinessDays(new Date(date), end_date ? new Date(end_date) : new Date(date))
      : 0;

    const insertRow: any = {
      operator_id,
      date,
      type,
      request_type: type,
      is_paid: paid,
      is_callout: isCallout,
      callout_reason: isCallout ? (reason || null) : null,
      pto_days_used: ptoDaysUsed,
      // Attendance facts (callout/no_show) are recorded immediately; planned
      // requests stay pending and flow through PATCH rank-based approval.
      status: isAttendanceFact ? 'approved' : 'pending',
      notes: notes || null,
      created_by: auth.userId,
      tenant_id: tenantId,
    };
    if (isAttendanceFact) {
      insertRow.approved_by = auth.userId;
      insertRow.approved_at = new Date().toISOString();
    }
    if (end_date && end_date !== date) insertRow.end_date = end_date;

    // For multi-day ranges we insert one row per day so the schedule board sees each day blocked
    const rowsToInsert: any[] = [];
    if (end_date && end_date > date) {
      const start = new Date(date);
      const end = new Date(end_date);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const iso = d.toISOString().slice(0, 10);
        rowsToInsert.push({ ...insertRow, date: iso, end_date: iso });
      }
    } else {
      rowsToInsert.push(insertRow);
    }

    const { data, error } = await supabaseAdmin
      .from('operator_time_off')
      .upsert(rowsToInsert, { onConflict: 'operator_id,date', ignoreDuplicates: false })
      .select('id, operator_id, date, type, request_type, is_paid, is_callout, pto_days_used, status, notes, created_at');

    if (error) {
      console.error('POST /api/admin/time-off insert error:', error);
      return NextResponse.json({ error: 'Failed to create time-off entry' }, { status: 500 });
    }

    // Sync operator_pto_balance (fire-and-forget on failure).
    // Bump callout_count ONLY for attendance facts (callout / no_show) — an
    // incident counter independent of the approval/PTO flow. Planned requests
    // (incl. sick / personal_day) do NOT debit PTO here; that happens on
    // approval in PATCH /api/admin/time-off/[id] (credited back on deny/cancel).
    if (isAttendanceFact) {
      const currentYear = new Date(date).getFullYear();
      Promise.resolve(upsertPtoBalance(operator_id, tenantId, currentYear, true, 0))
        .catch(() => {});
    }

    // ── Notifications, split by type ────────────────────────────────────
    // Attendance facts (callout/no_show)   → notify ALL management.
    // Planned requests (everything else)   → notify ONLY approvers (admin +
    //                                         super_admin), who decide them.
    {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('full_name')
        .eq('id', operator_id)
        .single();
      const operatorName = profile?.full_name ?? 'An operator';
      const label = type.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());

      // Attendance facts → notify ALL management; planned requests → notify
      // only the approvers. Role sets are single-sourced in lib/time-off.ts.
      const notifyRoles = isAttendanceFact
        ? [...MANAGEMENT_NOTIFY_ROLES]
        : [...APPROVER_NOTIFY_ROLES];

      const verb = isAttendanceFact ? 'logged' : 'requested';
      const msg = `${operatorName} ${verb} ${label} on ${date}${end_date && end_date !== date ? ` – ${end_date}` : ''}${notes ? ` — ${notes}` : ''}`;
      const notifTitle = isAttendanceFact ? 'Callout / Absence Logged' : 'New Time-Off Request';
      const notifKind = isAttendanceFact ? 'warning' : 'info';
      const notifType = isAttendanceFact ? 'operator_callout' : 'time_off_request';

      const { data: admins } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('tenant_id', tenantId)
        .in('role', notifyRoles);

      // Never notify the person the entry is about (e.g. an admin logging their
      // own request shouldn't ping themselves as an approver).
      const recipients = (admins ?? []).filter((a: { id: string }) => a.id !== operator_id);

      if (recipients.length > 0) {
        const notifRows = recipients.map((a: { id: string }) => ({
          user_id: a.id,
          tenant_id: tenantId,
          type: notifKind,
          title: notifTitle,
          message: msg,
          notification_type: notifType,
          related_entity_type: 'operator_time_off',
          action_url: '/dashboard/admin/time-off',
        }));
        Promise.resolve(supabaseAdmin.from('notifications').insert(notifRows))
          .catch(() => {});

        // Parallel native push to each recipient — fire-and-forget,
        // never blocks or alters the API response.
        for (const a of recipients as { id: string }[]) {
          sendPushToUser(a.id, {
            title: notifTitle,
            body: msg,
            data: { route: '/dashboard/admin/time-off' },
          }).catch(() => {});
        }
      }
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err) {
    console.error('Unexpected error POST /api/admin/time-off:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const tenantId = await getTenantId(auth.userId);
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant scope required' }, { status: 400 });
    }

    const id = request.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Missing query param: id' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('operator_time_off')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantId);

    if (error) {
      console.error('DELETE /api/admin/time-off error:', error);
      return NextResponse.json({ error: 'Failed to delete time-off entry' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Unexpected error DELETE /api/admin/time-off:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Count business days (Mon–Fri) between two dates, inclusive. Minimum 1. */
function calcBusinessDays(start: Date, end: Date): number {
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count || 1;
}

/** Upsert operator_pto_balance, incrementing callout_count or pto_days_used. */
async function upsertPtoBalance(
  operatorId: string,
  tenantId: string | null,
  year: number,
  isCallout: boolean,
  ptoDaysUsed: number
): Promise<void> {
  const { data: existing } = await supabaseAdmin
    .from('operator_pto_balance')
    .select('id, pto_days_used, callout_count')
    .eq('operator_id', operatorId)
    .eq('year', year)
    .maybeSingle();

  if (existing) {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (isCallout) updates.callout_count = (existing.callout_count || 0) + 1;
    if (ptoDaysUsed > 0) updates.pto_days_used = (existing.pto_days_used || 0) + ptoDaysUsed;
    await supabaseAdmin.from('operator_pto_balance').update(updates).eq('id', existing.id);
  } else {
    await supabaseAdmin.from('operator_pto_balance').insert({
      operator_id: operatorId,
      tenant_id: tenantId,
      year,
      pto_days_allocated: 10,
      pto_days_used: ptoDaysUsed,
      callout_count: isCallout ? 1 : 0,
    });
  }
}
