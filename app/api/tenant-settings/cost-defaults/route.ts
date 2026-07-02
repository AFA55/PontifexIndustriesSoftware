export const dynamic = 'force-dynamic';

/**
 * API Route: GET /api/tenant-settings/cost-defaults
 * Read-only: the caller's own tenant cost-standard defaults, used to
 * pre-fill the optional "Track job financials" section on the schedule
 * form. Any authenticated tenant member can read (not admin-gated) since
 * office/sales staff — not just admins — fill out the schedule form.
 * super_admin with no tenant gets nulls (falls back to blank inputs).
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    if (!auth.tenantId) {
      return NextResponse.json({
        success: true,
        data: { default_mileage_rate: null, default_equipment_cost: null, default_other_cost: null },
      });
    }

    const { data: tenant, error } = await supabaseAdmin
      .from('tenants')
      .select('default_mileage_rate, default_equipment_cost, default_other_cost')
      .eq('id', auth.tenantId)
      .single();

    if (error || !tenant) {
      return NextResponse.json({
        success: true,
        data: { default_mileage_rate: null, default_equipment_cost: null, default_other_cost: null },
      });
    }

    return NextResponse.json({ success: true, data: tenant });
  } catch (error) {
    console.error('Unexpected error in GET /api/tenant-settings/cost-defaults:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
