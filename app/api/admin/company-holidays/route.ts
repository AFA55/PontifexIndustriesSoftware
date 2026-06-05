export const dynamic = 'force-dynamic';

/**
 * GET  /api/admin/company-holidays        — list the tenant's holidays (optional ?year=)
 * POST /api/admin/company-holidays        — upsert a holiday {holiday_date,name,pay_hours,applies_to}
 *
 * Admin-only, tenant-scoped. Writes go through supabaseAdmin (bypasses RLS); the
 * company_holidays table also has tenant-scoped RLS for any client-side read.
 *
 * Eligibility scope (`applies_to`) drives WHO auto-receives holiday pay when an
 * admin runs the apply endpoint — see [id]/apply/route.ts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

const VALID_APPLIES_TO = new Set(['all', 'field', 'shop']);

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;
  if (!auth.tenantId) return NextResponse.json({ error: 'Tenant required' }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const yearRaw = searchParams.get('year');

  let query = supabaseAdmin
    .from('company_holidays')
    .select('*')
    .eq('tenant_id', auth.tenantId)
    .order('holiday_date', { ascending: true });

  if (yearRaw && /^\d{4}$/.test(yearRaw)) {
    query = query.gte('holiday_date', `${yearRaw}-01-01`).lte('holiday_date', `${yearRaw}-12-31`);
  }

  const { data, error } = await query;
  if (error) {
    console.error('company-holidays GET error:', error);
    return NextResponse.json({ error: 'Failed to load holidays', details: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;
  if (!auth.tenantId) return NextResponse.json({ error: 'Tenant required' }, { status: 400 });

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const holiday_date = body.holiday_date;
  const name = body.name ? String(body.name).trim() : '';
  const applies_to = body.applies_to ?? 'all';
  const payHoursRaw = body.pay_hours;

  if (!holiday_date || !/^\d{4}-\d{2}-\d{2}$/.test(holiday_date)) {
    return NextResponse.json({ error: 'holiday_date must be YYYY-MM-DD' }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  if (!VALID_APPLIES_TO.has(applies_to)) {
    return NextResponse.json({ error: `applies_to must be one of: ${Array.from(VALID_APPLIES_TO).join(', ')}` }, { status: 400 });
  }
  const pay_hours = payHoursRaw === undefined || payHoursRaw === null || payHoursRaw === '' ? 8 : Number(payHoursRaw);
  if (!Number.isFinite(pay_hours) || pay_hours < 0 || pay_hours > 24) {
    return NextResponse.json({ error: 'pay_hours must be between 0 and 24' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('company_holidays')
    .upsert(
      {
        tenant_id: auth.tenantId,
        holiday_date,
        name,
        pay_hours,
        applies_to,
        created_by: auth.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id,holiday_date' }
    )
    .select('*')
    .single();

  if (error) {
    console.error('company-holidays POST error:', error);
    return NextResponse.json({ error: 'Failed to save holiday', details: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}
