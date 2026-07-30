/**
 * Server-side geocoding (Nominatim / OpenStreetMap). Used to resolve a job's
 * address into jobsite coordinates for geofencing + distance. Free, ~1 req/sec
 * rate limit — callers must throttle (the backfill cron does one at a time).
 */

export interface GeoPoint {
  lat: number;
  lng: number;
}

/**
 * Geocode a free-text address → { lat, lng } or null if unresolvable.
 * Best-effort: never throws; returns null on any error/timeout.
 */
export async function geocodeAddress(address: string): Promise<GeoPoint | null> {
  const q = (address || '').trim();
  if (!q) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      headers: { 'User-Agent': 'PatriotConcreteCutting/1.0 (operator-platform)' },
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ lat?: string; lon?: string }>;
    const first = Array.isArray(data) ? data[0] : null;
    if (!first?.lat || !first?.lon) return null;
    const lat = Number(first.lat);
    const lng = Number(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

/**
 * Haversine distance in miles between two points. For geofence checks
 * (e.g. "within 0.5 mi of the jobsite").
 */
export function distanceMiles(a: GeoPoint, b: GeoPoint): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3958.8; // miles
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
