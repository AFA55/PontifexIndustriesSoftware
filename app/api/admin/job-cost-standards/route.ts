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
  labor_burden_pct: 25, // % markup on raw wages (payroll taxes, comp, insurance) — see lib/labor-cost.ts
};

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const tenantId = auth.tenantId;
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant scope required. super_admin must pass ?tenantId=' }, { status: 400 });
    }

    // labor_burden_pct lands with migration 20260802b_labor_burden.sql —
    // tolerate the column not existing yet (42703) so this GET never 500s
    // pre-migration (same degrade pattern as setup-account/validate).
    let { data, error } = await supabaseAdmin
      .from('tenants')
      .select('default_mileage_rate, default_equipment_cost, default_other_cost, labor_burden_pct')
      .eq('id', tenantId)
      .maybeSingle();

    if (error && error.code === '42703') {
      const retry = await supabaseAdmin
        .from('tenants')
        .select('default_mileage_rate, default_equipment_cost, default_other_cost')
        .eq('id', tenantId)
        .maybeSingle();
      data = retry.data as typeof data;
      error = retry.error;
    }

    if (error) {
      console.error('Error fetching job cost standards:', error);
      return NextResponse.json({ error: 'Failed to fetch job cost standards' }, { status: 500 });
    }

    const row = data as (Record<string, number | null> | null);
    return NextResponse.json({
      success: true,
      data: {
        default_mileage_rate: row?.default_mileage_rate ?? DEFAULTS.default_mileage_rate,
        default_equipment_cost: row?.default_equipment_cost ?? DEFAULTS.default_equipment_cost,
        default_other_cost: row?.default_other_cost ?? DEFAULTS.default_other_cost,
        labor_burden_pct: row?.labor_burden_pct ?? DEFAULTS.labor_burden_pct,
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
    const { default_mileage_rate, default_equipment_cost, default_other_cost, labor_burden_pct } = body;

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

    // Burden is a percentage — bounded 0–100 (this is billing math; a typo'd
    // 250% must not silently 3.5x every labor cost).
    if (labor_burden_pct !== undefined) {
      const pct = Number(labor_burden_pct);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        return NextResponse.json({ error: 'labor_burden_pct must be a number between 0 and 100' }, { status: 400 });
      }
      updates.labor_burden_pct = pct;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    let { data, error } = await supabaseAdmin
      .from('tenants')
      .update(updates)
      .eq('id', tenantId)
      .select('default_mileage_rate, default_equipment_cost, default_other_cost, labor_burden_pct')
      .single();

    if (error && error.code === '42703') {
      // Column not deployed yet (migration 20260802b pending).
      if ('labor_burden_pct' in updates) {
        // Be explicit rather than a generic 500 — don't silently drop the burden value.
        return NextResponse.json(
          { error: 'Labor burden requires a pending database migration (20260802b_labor_burden). Nothing was saved — retry after the migration is applied.' },
          { status: 409 }
        );
      }
      // Only the RETURNING list referenced the missing column — retry legacy.
      const retry = await supabaseAdmin
        .from('tenants')
        .update(updates)
        .eq('id', tenantId)
        .select('default_mileage_rate, default_equipment_cost, default_other_cost')
        .single();
      data = retry.data as typeof data;
      error = retry.error;
    }

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
