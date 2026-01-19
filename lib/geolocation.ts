33./**
 * Geolocation utilities for time tracking
 * Handles distance calculation and location verification
 */

// Shop location configuration
export const SHOP_LOCATION = {
  latitude: 33.97121,  // Pontifex Industries Shop location
  longitude: -84.18066, // Pontifex Industries Shop location
  name: 'Pontifex Industries Shop',
};

// Allowed radius in meters (100m = ~328 feet)
export const ALLOWED_RADIUS_METERS = 100;

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
  // TESTING MODE: Bypass location check for development
  // ⚠️ This should NEVER be enabled in production!
  const bypassLocationCheck = process.env.NEXT_PUBLIC_BYPASS_LOCATION_CHECK === 'true';

  if (bypassLocationCheck) {
    console.warn('⚠️ TESTING MODE: Location verification bypassed!');
    return {
      verified: true,
      location: {
        latitude: SHOP_LOCATION.latitude,
        longitude: SHOP_LOCATION.longitude,
        accuracy: 0,
      },
      distance: 0,
      distanceFormatted: '0m (bypassed for testing)',
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
