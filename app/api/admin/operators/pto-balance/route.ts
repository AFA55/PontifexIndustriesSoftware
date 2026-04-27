export const dynamic = 'force-dynamic';

/**
 * API Route: /api/admin/operators/pto-balance
 * GET  – return all operators with their PTO balance for the current (or specified) year
 * PUT  – admin adjusts pto_days_allocated for an operator
 *
 * GET query params:
 *   ?year=<yyyy>   — defaults to current year
 *
 * PUT body:
 *   { operatorId: string, ptoDaysAllocated: number, year?: number }
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
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant scope required' }, { status: 400 });
    }

    const year = parseInt(
      request.nextUrl.searchParams.get('year') || String(new Date().getFullYear()),
      10
    );

    // Fetch all operators/apprentices for this tenant
    const { data: operators, error: opErr } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, avatar_url, role')
      .eq('tenant_id', tenantId)
      .in('role', ['operator', 'apprentice'])
      .order('full_name');

    if (opErr) {
      console.error('pto-balance GET operators error:', opErr);
      return NextResponse.json({ error: 'Failed to fetch operators' }, { status: 500 });
    }

    if (!operators || operators.length === 0) {
      return NextResponse.json({ success: true, data: [], year });
    }

    const operatorIds = operators.map((o: any) => o.id);

    // Fetch existing balance rows for this year
    const { data: balances, error: balErr } = await supabaseAdmin
      .from('operator_pto_balance')
      .select('operator_id, pto_days_allocated, pto_days_used, callout_count, updated_at')
      .eq('tenant_id', tenantId)
      .eq('year', year)
      .in('operator_id', operatorIds);

    if (balErr) {
      console.error('pto-balance GET balance error:', balErr);
      return NextResponse.json({ error: 'Failed to fetch PTO balances' }, { status: 500 });
    }

    // Index balances by operator_id
    const balMap: Record<string, any> = {};
    for (const b of balances ?? []) {
      balMap[b.operator_id] = b;
    }

    // Merge operator list with their balance data (default 10 days if no row exists)
    const result = operators.map((op: any) => {
      const b = balMap[op.id];
      const allocated = b?.pto_days_allocated ?? 10;
      const used = b?.pto_days_used ?? 0;
      return {
        operator_id: op.id,
        operator_name: op.full_name ?? 'Unknown',
        operator_avatar: op.avatar_url ?? null,
        role: op.role,
        year,
        pto_days_allocated: allocated,
        pto_days_used: used,
        pto_days_remaining: Math.max(0, allocated - used),
        callout_count: b?.callout_count ?? 0,
        has_balance_row: !!b,
        updated_at: b?.updated_at ?? null,
      };
    });

    return NextResponse.json({ success: true, data: result, year });
  } catch (err) {
    console.error('Unexpected error GET /api/admin/operators/pto-balance:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const tenantId = await getTenantId(auth.userId);
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant scope required' }, { status: 400 });
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { operatorId, ptoDaysAllocated, year } = body;

    if (!operatorId || ptoDaysAllocated === undefined || ptoDaysAllocated === null) {
      return NextResponse.json(
        { error: 'Missing required fields: operatorId, ptoDaysAllocated' },
        { status: 400 }
      );
    }

    const allocDays = Number(ptoDaysAllocated);
    if (isNaN(allocDays) || allocDays < 0) {
      return NextResponse.json(
        { error: 'ptoDaysAllocated must be a non-negative number' },
        { status: 400 }
      );
    }

    const targetYear = year ? parseInt(year, 10) : new Date().getFullYear();

    // Verify operator belongs to this tenant
    const { data: profile, error: profErr } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, role')
      .eq('id', operatorId)
      .eq('tenant_id', tenantId)
      .in('role', ['operator', 'apprentice'])
      .maybeSingle();

    if (profErr || !profile) {
      return NextResponse.json(
        { error: 'Operator not found or does not belong to your tenant' },
        { status: 404 }
      );
    }

    // Upsert the balance row
    const { data: upserted, error: upsertErr } = await supabaseAdmin
      .from('operator_pto_balance')
      .upsert(
        {
          operator_id: operatorId,
          tenant_id: tenantId,
          year: targetYear,
          pto_days_allocated: allocDays,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'operator_id,year', ignoreDuplicates: false }
      )
      .select('operator_id, year, pto_days_allocated, pto_days_used, callout_count, updated_at')
      .single();

    if (upsertErr) {
      console.error('pto-balance PUT upsert error:', upsertErr);
      return NextResponse.json({ error: 'Failed to update PTO allocation' }, { status: 500 });
    }

    const used = upserted.pto_days_used ?? 0;
    return NextResponse.json({
      success: true,
      data: {
        ...upserted,
        operator_name: profile.full_name ?? 'Unknown',
        pto_days_remaining: Math.max(0, allocDays - used),
      },
    });
  } catch (err) {
    console.error('Unexpected error PUT /api/admin/operators/pto-balance:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
