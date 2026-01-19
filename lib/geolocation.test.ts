/**
 * Geolocation Utilities Tests
 */

import {
  calculateDistance,
  isWithinShopRadius,
  formatCoordinates,
  getGoogleMapsLink,
  SHOP_LOCATION,
  ALLOWED_RADIUS_METERS,
} from './geolocation';

describe('Geolocation Utilities', () => {
  describe('calculateDistance', () => {
    it('should calculate distance between two coordinates correctly', () => {
      // Los Angeles to San Francisco (approx 559 km)
      const distance = calculateDistance(34.0522, -118.2437, 37.7749, -122.4194);
      expect(distance).toBeGreaterThan(500000); // > 500 km
      expect(distance).toBeLessThan(600000); // < 600 km
    });

    it('should return 0 for identical coordinates', () => {
      const distance = calculateDistance(34.0522, -118.2437, 34.0522, -118.2437);
      expect(distance).toBe(0);
    });

    it('should calculate small distances accurately', () => {
      // Two points very close together (~111 meters apart)
      const distance = calculateDistance(34.0522, -118.2437, 34.0532, -118.2437);
      expect(distance).toBeGreaterThan(100);
      expect(distance).toBeLessThan(120);
    });

    it('should handle negative coordinates', () => {
      const distance = calculateDistance(-33.8688, 151.2093, -37.8136, 144.9631);
      expect(distance).toBeGreaterThan(0);
    });
  });

  describe('isWithinShopRadius', () => {
    it('should return true when location is within allowed radius', () => {
      const result = isWithinShopRadius({
        latitude: SHOP_LOCATION.latitude,
        longitude: SHOP_LOCATION.longitude,
      });

      expect(result.isWithinRange).toBe(true);
      expect(result.distance).toBe(0);
      expect(result.distanceFormatted).toBe('0m');
    });

    it('should return false when location is outside allowed radius', () => {
      // Location 1km away
      const result = isWithinShopRadius({
        latitude: SHOP_LOCATION.latitude + 0.01,
        longitude: SHOP_LOCATION.longitude + 0.01,
      });

      expect(result.isWithinRange).toBe(false);
      expect(result.distance).toBeGreaterThan(ALLOWED_RADIUS_METERS);
    });

    it('should format distance in meters when less than 1km', () => {
      const result = isWithinShopRadius({
        latitude: SHOP_LOCATION.latitude + 0.001,
        longitude: SHOP_LOCATION.longitude,
      });

      expect(result.distanceFormatted).toMatch(/^\d+m$/);
    });

    it('should format distance in kilometers when greater than 1km', () => {
      const result = isWithinShopRadius({
        latitude: SHOP_LOCATION.latitude + 0.01,
        longitude: SHOP_LOCATION.longitude + 0.01,
      });

      expect(result.distanceFormatted).toMatch(/^\d+\.\d{2}km$/);
    });

    it('should handle edge case at exactly the allowed radius', () => {
      // Calculate coordinates that are exactly ALLOWED_RADIUS_METERS away
      // Using approximation: 1 degree latitude ≈ 111,000 meters
      const offsetDegrees = ALLOWED_RADIUS_METERS / 111000;

      const result = isWithinShopRadius({
        latitude: SHOP_LOCATION.latitude + offsetDegrees,
        longitude: SHOP_LOCATION.longitude,
      });

      // Should be very close to the allowed radius
      expect(Math.abs(result.distance - ALLOWED_RADIUS_METERS)).toBeLessThan(10);
    });
  });

  describe('formatCoordinates', () => {
    it('should format coordinates with 6 decimal places', () => {
      const formatted = formatCoordinates(34.0522, -118.2437);
      expect(formatted).toBe('34.052200, -118.243700');
    });

    it('should round coordinates to 6 decimal places', () => {
      const formatted = formatCoordinates(34.05223456789, -118.24371234567);
      expect(formatted).toBe('34.052235, -118.243712');
    });

    it('should handle negative coordinates', () => {
      const formatted = formatCoordinates(-33.8688, -151.2093);
      expect(formatted).toBe('-33.868800, -151.209300');
    });

    it('should handle zero coordinates', () => {
      const formatted = formatCoordinates(0, 0);
      expect(formatted).toBe('0.000000, 0.000000');
    });
  });

  describe('getGoogleMapsLink', () => {
    it('should generate correct Google Maps URL', () => {
      const link = getGoogleMapsLink(34.0522, -118.2437);
      expect(link).toBe('https://www.google.com/maps?q=34.0522,-118.2437');
    });

    it('should handle negative coordinates', () => {
      const link = getGoogleMapsLink(-33.8688, -151.2093);
      expect(link).toBe('https://www.google.com/maps?q=-33.8688,-151.2093');
    });

    it('should handle zero coordinates', () => {
      const link = getGoogleMapsLink(0, 0);
      expect(link).toBe('https://www.google.com/maps?q=0,0');
    });

    it('should handle coordinates with many decimal places', () => {
      const link = getGoogleMapsLink(34.05223456789, -118.24371234567);
      expect(link).toBe('https://www.google.com/maps?q=34.05223456789,-118.24371234567');
    });
  });
});
