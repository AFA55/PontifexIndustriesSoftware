33./**
 * Geolocation utilities for time tracking
 * Handles distance calculation and location verification
 */

// Shop location configuration — Patriot Concrete Cutting
export const SHOP_LOCATION = {
  latitude: 34.76874307354808,   // Patriot Concrete Cutting
  longitude: -82.43569623308949, // Patriot Concrete Cutting
  name: 'Patriot Concrete Cutting',
};

// Allowed radius in meters (6.1m ≈ 20 feet)
export const ALLOWED_RADIUS_METERS = 6.1;

/**
 * Location coordinates interface
 */
export interface Coordinates {
  latitude: number;
  longitude: number;
  accuracy?: number; // GPS accuracy in meters
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
 * Check if coordinates are within allowed radius of shop location
 *
 * @param userLocation - User's current location
 * @returns Object with isWithinRange boolean and distance in meters
 */
export function isWithinShopRadius(userLocation: Coordinates): {
  isWithinRange: boolean;
  distance: number;
  distanceFormatted: string;
} {
  const distance = calculateDistance(
    userLocation.latitude,
    userLocation.longitude,
    SHOP_LOCATION.latitude,
    SHOP_LOCATION.longitude
  );

  const isWithinRange = distance <= ALLOWED_RADIUS_METERS;

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
