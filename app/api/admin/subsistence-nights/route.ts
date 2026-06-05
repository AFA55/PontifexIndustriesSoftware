export const dynamic = 'force-dynamic';

/**
 * Admin override for subsistence (out-of-town overnight) nights.
 *
 * The operator self-records nights at day-complete (see
 * app/api/job-orders/[id]/daily-log/route.ts). This route lets an
 * admin / operations_manager / super_admin retroactively add, correct,
 * or remove a night.
 *
 *   GET    ?operatorId=&weekStart=   → list a week's nights for an operator
 *   POST   { operator_id, night_date, job_order_id?, note? } → upsert (source:'admin')
 *   DELETE { operator_id, night_date } → remove a night
 *
 * All operations are tenant-scoped. super_admin (null tenant) may pass
 * ?tenantId= to scope reads; writes resolve tenant from the operator's profile.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';
import { mondayOf, weekDatesFrom, parseYMDLocal } from '@/lib/dates';

/** True for a well-formed bare 'YYYY-MM-DD' that round-trips as a real local date. */
function isValidYMD(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = parseYMDLocal(value);
  return !Number.isNaN(d.getTime());
}

/**
 * Resolve the tenant to scope this request against.
 * - non-super-admin: their own tenant (guaranteed non-null by requireAdmin).
 * - super_admin: explicit ?tenantId= if present, else the operator's tenant.
 * Returns null when it cannot be resolved (caller should 400).
 */
async function resolveTenant(
  auth: { role: string; tenantId: string | null },
  request: NextRequest,
  operatorId?: string | null
): Promise<string | null> {
  if (auth.role !== 'super_admin') return auth.tenantId;
  const explicit = new URL(request.url).searchParams.get('tenantId');
  if (explicit) return explicit;
  if (operatorId) {
    const { data } = await supabaseAdmin
      .from('profiles')
      .select('tenant_id')
      .eq('id', operatorId)
      .maybeSingle();
    return data?.tenant_id || null;
  }
  return null;
}

// ─── GET: list a week's nights for an operator ──────────────────────────────
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;

  const { searchParams } = new URL(request.url);
  const operatorId = searchParams.get('operatorId');
  const weekStartParam = searchParams.get('weekStart');

  if (!operatorId) {
    return NextResponse.json({ error: 'operatorId is required' }, { status: 400 });
  }

  const tenantId = await resolveTenant(auth, request, operatorId);
  if (!tenantId) {
    return NextResponse.json(
      { error: 'Tenant scope required. super_admin must pass ?tenantId=' },
      { status: 400 }
    );
  }

  // Week range: default to the current week's Monday; tolerate any in-week date.
  const monday = weekStartParam && isValidYMD(weekStartParam)
    ? mondayOf(weekStartParam)
    : mondayOf();
  const weekDates = weekDatesFrom(monday);
  const start = weekDates[0];
  const end = weekDates[6];

  const { data, error } = await supabaseAdmin
    .from('subsistence_nights')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('operator_id', operatorId)
    .gte('night_date', start)
    .lte('night_date', end)
    .order('night_date', { ascending: true });

  if (error) {
    console.error('Error listing subsistence nights:', error);
    return NextResponse.json({ error: 'Failed to list subsistence nights' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    data: data || [],
    weekStart: start,
    weekEnd: end,
    count: (data || []).length,
  });
}

// ─── POST: upsert a night (admin override) ──────────────────────────────────
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { operator_id, night_date, job_order_id, job_number, note } = body || {};

  if (!operator_id || typeof operator_id !== 'string') {
    return NextResponse.json({ error: 'operator_id is required' }, { status: 400 });
  }
  if (!isValidYMD(night_date)) {
    return NextResponse.json({ error: 'night_date must be a valid YYYY-MM-DD' }, { status: 400 });
  }

  const tenantId = await resolveTenant(auth, request, operator_id);
  if (!tenantId) {
    return NextResponse.json(
      { error: 'Tenant scope required. super_admin must pass ?tenantId=' },
      { status: 400 }
    );
  }

  // Defense in depth: verify the operator belongs to the resolved tenant.
  const { data: opProfile } = await supabaseAdmin
    .from('profiles')
    .select('tenant_id')
    .eq('id', operator_id)
    .maybeSingle();
  if (opProfile && opProfile.tenant_id && opProfile.tenant_id !== tenantId) {
    return NextResponse.json({ error: 'Operator is not in this tenant' }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from('subsistence_nights')
    .upsert(
      {
        tenant_id: tenantId,
        operator_id,
        night_date,
        job_order_id: job_order_id || null,
        job_number: job_number || null,
        source: 'admin',
        created_by: auth.userId,
        note: note || null,
      },
      { onConflict: 'operator_id,night_date' }
    )
    .select()
    .single();

  if (error) {
    console.error('Error upserting subsistence night:', error);
    return NextResponse.json({ error: 'Failed to save subsistence night' }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}

// ─── DELETE: remove a night ─────────────────────────────────────────────────
export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { operator_id, night_date } = body || {};

  if (!operator_id || typeof operator_id !== 'string') {
    return NextResponse.json({ error: 'operator_id is required' }, { status: 400 });
  }
  if (!isValidYMD(night_date)) {
    return NextResponse.json({ error: 'night_date must be a valid YYYY-MM-DD' }, { status: 400 });
  }

  const tenantId = await resolveTenant(auth, request, operator_id);
  if (!tenantId) {
    return NextResponse.json(
      { error: 'Tenant scope required. super_admin must pass ?tenantId=' },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin
    .from('subsistence_nights')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('operator_id', operator_id)
    .eq('night_date', night_date);

  if (error) {
    console.error('Error deleting subsistence night:', error);
    return NextResponse.json({ error: 'Failed to delete subsistence night' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
