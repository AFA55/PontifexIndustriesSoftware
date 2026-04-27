export const dynamic = 'force-dynamic';

/**
 * API Route: /api/admin/schedule-board/time-off
 * GET: fetch time-off entries for a date or date range
 * POST: create a time-off entry (includes notification for blocked types)
 * DELETE: delete a time-off entry by id
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const tenantId = await getTenantId(auth.userId);

    if (!tenantId) return NextResponse.json({ error: 'Tenant scope required. super_admin must pass ?tenantId=' }, { status: 400 });
    const date = request.nextUrl.searchParams.get('date');
    const startDate = request.nextUrl.searchParams.get('startDate');
    const endDate = request.nextUrl.searchParams.get('endDate');

    let query = supabaseAdmin
      .from('operator_time_off')
      .select('id, operator_id, date, type, notes, status, approved_by, created_at')
      .order('date', { ascending: true });

    query = query.eq('tenant_id', tenantId)
      // Only show approved entries on the schedule board — pending requests don't block slots yet
      .or('status.eq.approved,status.is.null');

    if (date) {
      query = query.eq('date', date);
    } else if (startDate && endDate) {
      query = query.gte('date', startDate).lte('date', endDate);
    } else {
      return NextResponse.json({ error: 'Must provide date or startDate+endDate' }, { status: 400 });
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching time-off:', error);
      return NextResponse.json({ error: 'Failed to fetch time-off entries' }, { status: 500 });
    }

    // Fetch operator names separately (operator_time_off.operator_id FKs to auth.users,
    // so PostgREST cannot embed profiles automatically).
    const operatorIds = [...new Set((data || []).map((e: any) => e.operator_id).filter(Boolean))];
    const nameMap: Record<string, string> = {};
    if (operatorIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name')
        .in('id', operatorIds);
      for (const p of profiles ?? []) {
        nameMap[p.id] = p.full_name ?? '';
      }
    }

    const entries = (data || []).map((entry: any) => ({
      id: entry.id,
      operator_id: entry.operator_id,
      operator_name: nameMap[entry.operator_id] || 'Unknown',
      date: entry.date,
      type: entry.type,
      notes: entry.notes,
      approved_by: entry.approved_by,
      created_at: entry.created_at,
    }));

    return NextResponse.json({ success: true, data: entries });
  } catch (error) {
    console.error('Unexpected error in GET /api/admin/schedule-board/time-off:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const tenantId = await getTenantId(auth.userId);

    if (!tenantId) return NextResponse.json({ error: 'Tenant scope required. super_admin must pass ?tenantId=' }, { status: 400 });
    const body = await request.json();
    const { operator_id, date, type, notes } = body;

    if (!operator_id || !date || !type) {
      return NextResponse.json({ error: 'Missing required fields: operator_id, date, type' }, { status: 400 });
    }

    const validTypes = [
      'pto', 'unpaid', 'worked_last_night', 'sick', 'other',
      'unavailable', 'personal_day', 'no_show', 'vacation',
    ];
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: `Invalid type. Must be one of: ${validTypes.join(', ')}` }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('operator_time_off')
      .insert({
        operator_id,
        date,
        type,
        notes: notes || null,
        approved_by: auth.userId,
        created_by: auth.userId,
        tenant_id: tenantId || null,
      })
      .select('id, operator_id, date, type, notes, created_at')
      .single();

    if (error) {
      // Handle unique constraint violation
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Time-off entry already exists for this operator on this date' }, { status: 409 });
      }
      console.error('Error creating time-off:', error);
      return NextResponse.json({ error: 'Failed to create time-off entry' }, { status: 500 });
    }

    // Fire in-app notification when admin marks an operator as blocked/unavailable
    const BLOCKED_TYPES = ['unavailable', 'sick', 'no_show', 'personal_day', 'vacation'];
    if (BLOCKED_TYPES.includes(type)) {
      // Fetch operator name for the notification message
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('full_name')
        .eq('id', operator_id)
        .single();
      const operatorName = profile?.full_name || 'An operator';
      const reasonLabel: Record<string, string> = {
        unavailable: 'Unavailable', sick: 'Sick', no_show: 'No-Show',
        personal_day: 'Personal Day', vacation: 'Vacation',
      };
      const label = reasonLabel[type] || type;
      const notifMessage = `${operatorName} is unavailable on ${date} (${label})${notes ? ` — ${notes}` : ''}`;

      // Notify all admins/ops managers in the tenant
      const { data: admins } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('tenant_id', tenantId)
        .in('role', ['admin', 'super_admin', 'operations_manager']);

      if (admins && admins.length > 0) {
        const notifRows = admins.map((a: { id: string }) => ({
          user_id: a.id,
          tenant_id: tenantId,
          type: 'warning',
          title: 'Operator Marked Unavailable',
          message: notifMessage,
          notification_type: 'operator_unavailable',
          related_entity_type: 'operator_time_off',
          related_entity_id: data?.id || null,
          action_url: '/dashboard/admin/schedule-board',
        }));
        Promise.resolve(supabaseAdmin.from('notifications').insert(notifRows))
          .then((res: any) => { if (res.error) console.error('Notification insert error:', res.error); })
          .catch(() => {});
      }
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    console.error('Unexpected error in POST /api/admin/schedule-board/time-off:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const tenantId = await getTenantId(auth.userId);

    if (!tenantId) return NextResponse.json({ error: 'Tenant scope required. super_admin must pass ?tenantId=' }, { status: 400 });
    const id = request.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Missing required query param: id' }, { status: 400 });
    }

    let deleteQuery = supabaseAdmin
      .from('operator_time_off')
      .delete()
      .eq('id', id);
    deleteQuery = deleteQuery.eq('tenant_id', tenantId);
    const { error } = await deleteQuery;

    if (error) {
      console.error('Error deleting time-off:', error);
      return NextResponse.json({ error: 'Failed to delete time-off entry' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Time-off entry deleted' });
  } catch (error) {
    console.error('Unexpected error in DELETE /api/admin/schedule-board/time-off:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
