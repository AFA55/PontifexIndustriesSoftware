/**
 * Server-only tenant shop-location lookup.
 *
 * Split out from lib/geolocation.ts (which is imported by client components
 * like DriveTimeFromShop) because this needs the service-role Supabase client
 * — pulling that into a client-imported module would leak a server secret
 * into the client bundle. Any server caller (API routes, server components)
 * that needs "this tenant's shop location, falling back to the default"
 * should use this instead of re-deriving the same tenants.shop_latitude /
 * shop_longitude fetch inline.
 *
 * Mirrors the exact fetch shape already used by app/api/timecard/clock-in/route.ts.
 * That route is payroll-critical and left untouched here — this is a parallel,
 * non-duplicative addition for new callers (e.g. schedule-form drive-distance).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { SHOP_LOCATION, type ShopOverride } from '@/lib/geolocation';

/**
 * Fetch a tenant's configured shop coordinates. Returns undefined when the
 * tenant hasn't set custom coordinates (callers should fall back to
 * SHOP_LOCATION themselves, same as the clock-in route does), or when the
 * lookup fails for any reason (non-critical — never throw).
 */
export async function getTenantShopLocation(
  supabaseAdmin: SupabaseClient,
  tenantId: string | null,
): Promise<ShopOverride | undefined> {
  return (await getTenantShopContext(supabaseAdmin, tenantId)).shop;
}

/** Default when a tenant hasn't configured one — matches every other caller. */
export const DEFAULT_TENANT_TIMEZONE = 'America/New_York';

export interface TenantShopContext {
  /** Configured override, or undefined when the tenant hasn't set coordinates. */
  shop: ShopOverride | undefined;
  /** Always-present coordinates (falls back to SHOP_LOCATION). */
  coords: { latitude: number; longitude: number };
  /** tenants.timezone, or DEFAULT_TENANT_TIMEZONE. */
  timezone: string;
}

/**
 * ONE `tenants` read for callers that need both the shop pin and the tenant
 * timezone (e.g. /api/timecard/current, which is polled every couple of minutes
 * on native — it used to issue a second identical row read just for `timezone`).
 * Never throws.
 */
export async function getTenantShopContext(
  supabaseAdmin: SupabaseClient,
  tenantId: string | null,
): Promise<TenantShopContext> {
  const fallback: TenantShopContext = {
    shop: undefined,
    coords: { latitude: SHOP_LOCATION.latitude, longitude: SHOP_LOCATION.longitude },
    timezone: DEFAULT_TENANT_TIMEZONE,
  };
  if (!tenantId) return fallback;

  try {
    const { data: tenantRow } = await supabaseAdmin
      .from('tenants')
      .select('shop_latitude, shop_longitude, shop_name, clock_in_radius_meters, clock_out_radius_meters, timezone')
      .eq('id', tenantId)
      .maybeSingle();

    const timezone = tenantRow?.timezone || DEFAULT_TENANT_TIMEZONE;

    if (tenantRow?.shop_latitude == null || tenantRow?.shop_longitude == null) {
      return { ...fallback, timezone };
    }

    const shop: ShopOverride = {
      latitude: tenantRow.shop_latitude,
      longitude: tenantRow.shop_longitude,
      name: tenantRow.shop_name ?? SHOP_LOCATION.name,
      radius: tenantRow.clock_in_radius_meters ?? undefined,
      clockOutRadius: tenantRow.clock_out_radius_meters ?? undefined,
    };
    return { shop, coords: { latitude: shop.latitude, longitude: shop.longitude }, timezone };
  } catch {
    return fallback;
  }
}

/** Same as getTenantShopLocation but always returns coordinates — falls back to SHOP_LOCATION. */
export async function getTenantShopLocationOrDefault(
  supabaseAdmin: SupabaseClient,
  tenantId: string | null,
): Promise<{ latitude: number; longitude: number }> {
  const override = await getTenantShopLocation(supabaseAdmin, tenantId);
  return override ?? { latitude: SHOP_LOCATION.latitude, longitude: SHOP_LOCATION.longitude };
}
