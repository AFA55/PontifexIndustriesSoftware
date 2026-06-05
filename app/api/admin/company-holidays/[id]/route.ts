export const dynamic = 'force-dynamic';

/**
 * PATCH  /api/admin/company-holidays/[id]  — edit name/pay_hours/applies_to/is_active
 * DELETE /api/admin/company-holidays/[id]  — remove a holiday
 *
 * Admin-only, tenant-scoped. The row's tenant_id is verified == auth.tenantId
 * (super_admin bypass) before any mutation.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

const VALID_APPLIES_TO = new Set(['all', 'field', 'shop']);

/** Load the holiday and confirm it belongs to the caller's tenant. */
async function loadOwnedHoliday(id: string, auth: { tenantId: string | null; role: string }) {
  const { data: holiday, error } = await supabaseAdmin
    .from('company_holidays')
    .select('id, tenant_id')
    .eq('id', id)
    .maybeSingle();
  if (error || !holiday) return { error: NextResponse.json({ error: 'Holiday not found' }, { status: 404 }) };
  if (auth.role !== 'super_admin' && holiday.tenant_id !== auth.tenantId) {
    return { error: NextResponse.json({ error: 'Holiday not in your tenant' }, { status: 403 }) };
  }
  return { holiday };
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;
  if (!auth.tenantId) return NextResponse.json({ error: 'Tenant required' }, { status: 400 });

  const { id } = await params;
  const owned = await loadOwnedHoliday(id, auth);
  if ('error' in owned) return owned.error;

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 });
    update.name = name;
  }
  if (body.pay_hours !== undefined) {
    const pay_hours = Number(body.pay_hours);
    if (!Number.isFinite(pay_hours) || pay_hours < 0 || pay_hours > 24) {
      return NextResponse.json({ error: 'pay_hours must be between 0 and 24' }, { status: 400 });
    }
    update.pay_hours = pay_hours;
  }
  if (body.applies_to !== undefined) {
    if (!VALID_APPLIES_TO.has(body.applies_to)) {
      return NextResponse.json({ error: `applies_to must be one of: ${Array.from(VALID_APPLIES_TO).join(', ')}` }, { status: 400 });
    }
    update.applies_to = body.applies_to;
  }
  if (body.is_active !== undefined) {
    update.is_active = Boolean(body.is_active);
  }

  const { data, error } = await supabaseAdmin
    .from('company_holidays')
    .update(update)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    console.error('company-holidays PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update holiday', details: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;
  if (!auth.tenantId) return NextResponse.json({ error: 'Tenant required' }, { status: 400 });

  const { id } = await params;
  const owned = await loadOwnedHoliday(id, auth);
  if ('error' in owned) return owned.error;

  const { error } = await supabaseAdmin
    .from('company_holidays')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('company-holidays DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete holiday', details: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
