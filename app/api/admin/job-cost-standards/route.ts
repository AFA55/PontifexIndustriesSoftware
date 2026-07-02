export const dynamic = 'force-dynamic';

/**
 * GET  /api/admin/job-cost-standards — tenant default cost inputs for job P&L
 * PATCH /api/admin/job-cost-standards — update them (admin+)
 *
 * These are plain columns on `tenants` (default_mileage_rate,
 * default_equipment_cost, default_other_cost) — not a settings bag like
 * schedule_settings or timecard_settings_v2 — so this route reads/writes
 * `tenants` directly, tenant-scoped via auth.tenantId (mirrors how
 * /api/admin/timecard-settings handles tenants.default_start_time).
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

const DEFAULTS = {
  default_mileage_rate: 0.67, // IRS standard mileage rate is a sane fallback, not a Patriot-specific number
  default_equipment_cost: 0,
  default_other_cost: 0,
};

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const tenantId = auth.tenantId;
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant scope required. super_admin must pass ?tenantId=' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('tenants')
      .select('default_mileage_rate, default_equipment_cost, default_other_cost')
      .eq('id', tenantId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching job cost standards:', error);
      return NextResponse.json({ error: 'Failed to fetch job cost standards' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        default_mileage_rate: data?.default_mileage_rate ?? DEFAULTS.default_mileage_rate,
        default_equipment_cost: data?.default_equipment_cost ?? DEFAULTS.default_equipment_cost,
        default_other_cost: data?.default_other_cost ?? DEFAULTS.default_other_cost,
      },
    });
  } catch (error: unknown) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const tenantId = auth.tenantId;
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant scope required. super_admin must pass ?tenantId=' }, { status: 400 });
    }

    const body = await request.json();
    const { default_mileage_rate, default_equipment_cost, default_other_cost } = body;

    const updates: Record<string, number> = {};
    for (const [key, value] of Object.entries({
      default_mileage_rate,
      default_equipment_cost,
      default_other_cost,
    })) {
      if (value === undefined) continue;
      const num = Number(value);
      if (!Number.isFinite(num) || num < 0) {
        return NextResponse.json({ error: `${key} must be a non-negative number` }, { status: 400 });
      }
      updates[key] = num;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('tenants')
      .update(updates)
      .eq('id', tenantId)
      .select('default_mileage_rate, default_equipment_cost, default_other_cost')
      .single();

    if (error) {
      console.error('Error updating job cost standards:', error);
      return NextResponse.json({ error: 'Failed to update job cost standards' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Job cost standards updated',
      data,
    });
  } catch (error: unknown) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
