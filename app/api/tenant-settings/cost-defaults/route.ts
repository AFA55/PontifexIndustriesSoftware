export const dynamic = 'force-dynamic';

/**
 * API Route: GET /api/tenant-settings/cost-defaults
 * Read-only: the caller's own tenant cost-standard defaults, used to
 * pre-fill the optional "Track job financials" section on the schedule
 * form. Any authenticated tenant member can read (not admin-gated) since
 * office/sales staff — not just admins — fill out the schedule form.
 * super_admin with no tenant gets nulls (falls back to blank inputs).
 *
 * Also returns the tenant's shop coordinates (shop_latitude/shop_longitude)
 * so the schedule form can pass a tenant-aware `shopOverride` into
 * DriveTimeFromShop instead of the hardcoded Patriot default — same data
 * `getTenantShopLocation()` (lib/geolocation-server.ts) resolves server-side.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';

const EMPTY_DATA = {
  default_mileage_rate: null,
  default_equipment_cost: null,
  default_other_cost: null,
  shop_latitude: null,
  shop_longitude: null,
};

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    if (!auth.tenantId) {
      return NextResponse.json({ success: true, data: EMPTY_DATA });
    }

    const { data: tenant, error } = await supabaseAdmin
      .from('tenants')
      .select('default_mileage_rate, default_equipment_cost, default_other_cost, shop_latitude, shop_longitude')
      .eq('id', auth.tenantId)
      .single();

    if (error || !tenant) {
      return NextResponse.json({ success: true, data: EMPTY_DATA });
    }

    return NextResponse.json({ success: true, data: tenant });
  } catch (error) {
    console.error('Unexpected error in GET /api/tenant-settings/cost-defaults:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
