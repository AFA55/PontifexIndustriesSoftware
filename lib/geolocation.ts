/**
 * Geolocation utilities for time tracking
 * Handles distance calculation and location verification
 */

// Shop location configuration — Patriot Concrete Cutting.
// Updated May 8, 2026 (PT 3) to a more accurate center after on-site testing
// found the prior pin was offset enough that the shop manager couldn't clock
// in even at 100ft radius from certain spots in the building.
export const SHOP_LOCATION = {
  latitude: 34.768775733693474,   // Patriot Concrete Cutting (recentered)
  longitude: -82.43564252936702,  // Patriot Concrete Cutting (recentered)
  name: 'Patriot Concrete Cutting',
};

// Allowed radius for clock-IN/OUT — 30.48m ≈ 100 feet. Wide enough to
// accommodate mobile GPS drift indoors (metal/concrete walls scatter the
// signal). Still well below "from home" distance (which is miles), so
// anti-fraud is preserved — operator can't clock in from anywhere but at
// or directly outside the shop building.
export const ALLOWED_RADIUS_METERS = 30.48;

// Clock-out uses the same radius for now (no need for asymmetric — fraud
// incentive on clock-out is low anyway).
export const ALLOWED_RADIUS_CLOCKOUT_METERS = 30.48;

/**
 * Location coordinates interface
 */
export interface Coordinates {
  latitude: number;
  longitude: number;
  accuracy?: number; // GPS accuracy in meters
}

/**
 * Per-tenant shop location override.
 * When provided, isWithinShopRadius / isWithinShopRadiusForClockout use these
 * values instead of the hardcoded SHOP_LOCATION / ALLOWED_RADIUS_* constants.
 * Falls back to the constants when any field is absent.
 */
export interface ShopOverride {
  latitude: number;
  longitude: number;
  name?: string;
  /** Override radius in meters for clock-in (falls back to ALLOWED_RADIUS_METERS). */
  radius?: number;
  /** Override radius in meters for clock-out (falls back to ALLOWED_RADIUS_CLOCKOUT_METERS). */
  clockOutRadius?: number;
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in meters
 *
 * @param lat1 - Latitude of first point
 * @param lon1 - Longitude of first point
 * @param lat2 - Latitude of second point
 * @param lon2 - Longitude of second point
 * @returns Distance in meters
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

/**
 * Check if coordinates are within allowed radius of shop location.
 * Pass shopOverride to use a tenant-specific shop pin instead of the hardcoded default.
 *
 * @param userLocation - User's current location
 * @param shopOverride - Optional per-tenant shop coordinates + radius
 * @returns Object with isWithinRange boolean and distance in meters
 */
export function isWithinShopRadius(
  userLocation: Coordinates,
  shopOverride?: ShopOverride,
): {
  isWithinRange: boolean;
  distance: number;
  distanceFormatted: string;
} {
  const shopLat = shopOverride?.latitude ?? SHOP_LOCATION.latitude;
  const shopLon = shopOverride?.longitude ?? SHOP_LOCATION.longitude;
  const radius = shopOverride?.radius ?? ALLOWED_RADIUS_METERS;

  const distance = calculateDistance(
    userLocation.latitude,
    userLocation.longitude,
    shopLat,
    shopLon,
  );

  const isWithinRange = distance <= radius;

  // Format distance for display
  let distanceFormatted: string;
  if (distance < 1000) {
    distanceFormatted = `${Math.round(distance)}m`;
  } else {
    distanceFormatted = `${(distance / 1000).toFixed(2)}km`;
  }

  return {
    isWithinRange,
    distance,
    distanceFormatted,
  };
}

/**
 * Same shape as isWithinShopRadius but uses the clock-out radius.
 * Pass shopOverride to use a tenant-specific shop pin instead of the hardcoded default.
 */
export function isWithinShopRadiusForClockout(
  userLocation: Coordinates,
  shopOverride?: ShopOverride,
): {
  isWithinRange: boolean;
  distance: number;
  distanceFormatted: string;
} {
  const shopLat = shopOverride?.latitude ?? SHOP_LOCATION.latitude;
  const shopLon = shopOverride?.longitude ?? SHOP_LOCATION.longitude;
  const radius = shopOverride?.clockOutRadius ?? ALLOWED_RADIUS_CLOCKOUT_METERS;

  const distance = calculateDistance(
    userLocation.latitude,
    userLocation.longitude,
    shopLat,
    shopLon,
  );
  const isWithinRange = distance <= radius;
  const distanceFormatted = distance < 1000
    ? `${Math.round(distance)}m`
    : `${(distance / 1000).toFixed(2)}km`;
  return { isWithinRange, distance, distanceFormatted };
}

/**
 * Get user's current location using browser Geolocation API
 * Returns a promise that resolves with coordinates or rejects with error
 */
export function getCurrentLocation(): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by your browser'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      (error) => {
        let errorMessage = 'Unable to get your location';

        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = 'Location permission denied. Please enable location access in your browser settings.';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = 'Location information unavailable. Please check your device settings.';
            break;
          case error.TIMEOUT:
            errorMessage = 'Location request timed out. Please try again.';
            break;
        }

        reject(new Error(errorMessage));
      },
      {
        enableHighAccuracy: true, // Use GPS if available
        timeout: 10000, // 10 second timeout
        maximumAge: 0, // Don't use cached position
      }
    );
  });
}

/**
 * Single source of truth for the testing bypass.
 *
 * Two-factor activation:
 *   1. `NEXT_PUBLIC_LOCATION_BYPASS_CODE` env var must be set (build-time gate)
 *   2. User must have entered the correct code via the clock-in modal,
 *      which sets `sessionStorage['location_bypass_active'] = 'true'`
 *
 * If either is missing, the bypass returns false and GPS verification
 * runs normally. This means:
 *   - Production without the env var → bypass impossible
 *   - Dev with env var but no code entered → GPS still enforced
 *   - Dev with env var + code entered → bypass active for the tab session
 *   - Tab close clears sessionStorage → has to re-enter code next time
 */
export function isLocationBypassActive(): boolean {
  if (!process.env.NEXT_PUBLIC_LOCATION_BYPASS_CODE) return false;
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem('location_bypass_active') === 'true';
  } catch {
    return false;
  }
}

/**
 * Activate the testing bypass for the current tab session.
 * Called by the clock-in modal after successful code entry.
 */
export function activateLocationBypass(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem('location_bypass_active', 'true');
  } catch {
    // sessionStorage may be disabled in some privacy modes — fail silently
  }
}

/**
 * Verify user is at shop location before allowing clock in/out
 *
 * @returns Object with verification result and location data
 */
export async function verifyShopLocation(): Promise<{
  verified: boolean;
  location: Coordinates;
  distance: number;
  distanceFormatted: string;
  error?: string;
}> {
  if (isLocationBypassActive()) {
    console.warn('⚠️ TESTING BYPASS ACTIVE — GPS verification skipped for this session');
    return {
      verified: true,
      location: {
        latitude: SHOP_LOCATION.latitude,
        longitude: SHOP_LOCATION.longitude,
        accuracy: 0,
      },
      distance: 0,
      distanceFormatted: '0m (testing bypass)',
    };
  }

  try {
    const location = await getCurrentLocation();
    const { isWithinRange, distance, distanceFormatted } = isWithinShopRadius(location);

    if (!isWithinRange) {
      return {
        verified: false,
        location,
        distance,
        distanceFormatted,
        error: `You must be at ${SHOP_LOCATION.name} to clock in. You are ${distanceFormatted} away.`,
      };
    }

    return {
      verified: true,
      location,
      distance,
      distanceFormatted,
    };
  } catch (error: any) {
    return {
      verified: false,
      location: { latitude: 0, longitude: 0 },
      distance: 0,
      distanceFormatted: '0m',
      error: error.message || 'Failed to verify location',
    };
  }
}

/**
 * Format coordinates for display
 */
export function formatCoordinates(lat: number, lon: number): string {
  return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
}

/**
 * Generate Google Maps link for coordinates
 */
export function getGoogleMapsLink(lat: number, lon: number): string {
  return `https://www.google.com/maps?q=${lat},${lon}`;
}
