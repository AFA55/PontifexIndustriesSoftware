export const dynamic = 'force-dynamic';

/**
 * Attendance calendar API (founder's paper tracker, digitized).
 *   GET    /api/admin/attendance?month=YYYY-MM  — the month's grid data:
 *          field roster + manual attendance codes + AUTO overlays derived
 *          from data we already record (worked days, lates, approved time
 *          off) so admins only mark the judgment calls (EA/UA/NCNS/...).
 *   POST   /api/admin/attendance  { userId, date, code, note? }  — upsert
 *          the day's code (one code per employee per day, like the paper).
 *   DELETE /api/admin/attendance  { userId, date }  — clear the day.
 * Access: admin / super_admin / operations_manager (requireAdmin), tenant-scoped.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';
import { ATTENDANCE_CODE_SET } from '@/lib/attendance-codes';

const FIELD_ROLES = ['operator', 'apprentice'];

function monthRange(monthParam: string | null): { start: string; end: string; month: string } {
  const now = new Date();
  const [y, m] = /^\d{4}-\d{2}$/.test(monthParam ?? '')
    ? (monthParam as string).split('-').map(Number)
    : [now.getFullYear(), now.getMonth() + 1];
  const lastDay = new Date(y, m, 0).getDate();
  const mm = String(m).padStart(2, '0');
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(lastDay).padStart(2, '0')}`, month: `${y}-${mm}` };
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;
  if (!auth.tenantId) return NextResponse.json({ error: 'Tenant scope required' }, { status: 400 });

  const { start, end, month } = monthRange(request.nextUrl.searchParams.get('month'));

  const [rosterRes, eventsRes, cardsRes, timeOffRes] = await Promise.all([
    supabaseAdmin
      .from('profiles')
      .select('id, full_name, role')
      .eq('tenant_id', auth.tenantId)
      .in('role', FIELD_ROLES)
      .eq('active', true)
      .is('deleted_at', null)
      .order('full_name'),
    supabaseAdmin
      .from('attendance_events')
      .select('user_id, date, code, note')
      .eq('tenant_id', auth.tenantId)
      .gte('date', start)
      .lte('date', end),
    supabaseAdmin
      .from('timecards')
      .select('user_id, date, is_late, late_minutes')
      .eq('tenant_id', auth.tenantId)
      .gte('date', start)
      .lte('date', end)
      .limit(5000),
    supabaseAdmin
      .from('operator_time_off')
      .select('operator_id, date, end_date, type')
      .eq('tenant_id', auth.tenantId)
      .eq('status', 'approved')
      .lte('date', end)
      .gte('end_date', start),
  ]);
  if (rosterRes.error) return NextResponse.json({ error: rosterRes.error.message }, { status: 500 });

  // Auto overlays: worked / late from timecards, approved time off expanded per day.
  const auto: Record<string, Record<string, { worked?: boolean; late?: boolean; lateMinutes?: number; timeOff?: string }>> = {};
  const cell = (uid: string, date: string) => {
    auto[uid] = auto[uid] ?? {};
    auto[uid][date] = auto[uid][date] ?? {};
    return auto[uid][date];
  };
  for (const c of cardsRes.data ?? []) {
    const b = cell(c.user_id, String(c.date));
    b.worked = true;
    if (c.is_late) { b.late = true; b.lateMinutes = Number(c.late_minutes ?? 0); }
  }
  for (const t of timeOffRes.data ?? []) {
    const from = new Date(`${t.date}T00:00:00`);
    const to = new Date(`${t.end_date ?? t.date}T00:00:00`);
    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      const y = d.getFullYear(), mm = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
      const iso = `${y}-${mm}-${dd}`;
      if (iso < start || iso > end) continue;
      cell(t.operator_id, iso).timeOff = t.type ?? 'time_off';
    }
  }

  const events: Record<string, Record<string, { code: string; note: string | null }>> = {};
  for (const e of eventsRes.data ?? []) {
    events[e.user_id] = events[e.user_id] ?? {};
    events[e.user_id][String(e.date)] = { code: e.code, note: e.note };
  }

  return NextResponse.json({
    success: true,
    data: { month, roster: rosterRes.data ?? [], events, auto },
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;
  if (!auth.tenantId) return NextResponse.json({ error: 'Tenant scope required' }, { status: 400 });

  const body = await request.json().catch(() => null);
  const userId = String(body?.userId ?? '');
  const date = String(body?.date ?? '');
  const code = String(body?.code ?? '').toUpperCase().trim();
  const note = body?.note ? String(body.note).slice(0, 500) : null;

  if (!userId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'userId and date (YYYY-MM-DD) are required' }, { status: 400 });
  }
  if (!ATTENDANCE_CODE_SET.has(code)) {
    return NextResponse.json({ error: `Unknown attendance code: ${code}` }, { status: 400 });
  }
  // Employee must belong to the caller's tenant.
  const { data: person } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .eq('tenant_id', auth.tenantId)
    .maybeSingle();
  if (!person) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

  const { error } = await supabaseAdmin
    .from('attendance_events')
    .upsert(
      { tenant_id: auth.tenantId, user_id: userId, date, code, note, created_by: auth.userId },
      { onConflict: 'tenant_id,user_id,date' }
    );
  if (error) return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;
  if (!auth.tenantId) return NextResponse.json({ error: 'Tenant scope required' }, { status: 400 });

  const body = await request.json().catch(() => null);
  const userId = String(body?.userId ?? '');
  const date = String(body?.date ?? '');
  if (!userId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'userId and date are required' }, { status: 400 });
  }
  const { error } = await supabaseAdmin
    .from('attendance_events')
    .delete()
    .eq('tenant_id', auth.tenantId)
    .eq('user_id', userId)
    .eq('date', date);
  if (error) return NextResponse.json({ error: 'Failed to clear' }, { status: 500 });
  return NextResponse.json({ success: true });
}
