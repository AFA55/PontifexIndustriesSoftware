/**
 * Real drive-time from the shop — Google Routes API, server-side only.
 *
 * Founder ask (Jul 9): when a clock-out lands outside the shop geofence, show
 * the office how far away that is in DRIVE TIME ("0.17 mi ≈ 5 min from shop"),
 * computed by Google, not a straight-line guess.
 *
 * Design:
 * - Called ONCE per flagged clock-out (rare event), server-side, inside the
 *   existing fire-and-forget review block — never on a read path, never per
 *   list render, so Routes API cost stays a rounding error.
 * - Key: GOOGLE_MAPS_SERVER_KEY env (a server key — the NEXT_PUBLIC one is
 *   referrer-restricted and will be rejected for server calls, but we try it
 *   last anyway in case the restriction allows it).
 * - Fail-soft: no key / timeout / API error → falls back to the straight-line
 *   estimate (road factor 1.3, ~28 mph local) marked source 'estimate'. The
 *   caller stores whatever we return; the UI labels estimates with '~'.
 */

const ROUTES_ENDPOINT = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const TIMEOUT_MS = 5_000;

export interface DriveEstimate {
  minutes: number;
  miles: number;
  source: 'google' | 'estimate';
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fallbackEstimate(fromLat: number, fromLng: number, toLat: number, toLng: number): DriveEstimate {
  const straightMiles = haversineMeters(fromLat, fromLng, toLat, toLng) / 1609.344;
  const roadMiles = straightMiles * 1.3; // typical road-vs-crow factor
  const ASSUMED_LOCAL_MPH = 28;
  return {
    minutes: Math.max(1, Math.round((roadMiles / ASSUMED_LOCAL_MPH) * 60)),
    miles: Math.round(roadMiles * 100) / 100,
    source: 'estimate',
  };
}

/** Drive time between two points. Never throws; always returns SOMETHING usable. */
export async function estimateDrive(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): Promise<DriveEstimate> {
  const key =
    process.env.GOOGLE_MAPS_SERVER_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) return fallbackEstimate(fromLat, fromLng, toLat, toLng);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(ROUTES_ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters',
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: fromLat, longitude: fromLng } } },
        destination: { location: { latLng: { latitude: toLat, longitude: toLng } } },
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_UNAWARE',
        units: 'IMPERIAL',
      }),
    });
    clearTimeout(timer);
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.warn('[drive-time] Routes API error', res.status, detail.slice(0, 160));
      return fallbackEstimate(fromLat, fromLng, toLat, toLng);
    }
    const json = await res.json();
    const route = json?.routes?.[0];
    const seconds = route?.duration ? parseInt(String(route.duration).replace(/s$/, ''), 10) : NaN;
    const meters = Number(route?.distanceMeters);
    if (!Number.isFinite(seconds) || !Number.isFinite(meters)) {
      return fallbackEstimate(fromLat, fromLng, toLat, toLng);
    }
    return {
      minutes: Math.max(1, Math.round(seconds / 60)),
      miles: Math.round((meters / 1609.344) * 100) / 100,
      source: 'google',
    };
  } catch (err) {
    console.warn('[drive-time] falling back to estimate:', err instanceof Error ? err.message : err);
    return fallbackEstimate(fromLat, fromLng, toLat, toLng);
  }
}
