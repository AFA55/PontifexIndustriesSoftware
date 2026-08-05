/**
 * Estimated arrival for a crew heading to a jobsite.
 *
 * ── The rule (founder, Aug 2026) ─────────────────────────────────────────────
 * The crew taps "In Route" on DAY ONE only. From day two onward the customer
 * shouldn't need the crew to press anything — the ticket shows an estimated
 * arrival worked out from how far the jobsite is from the shop, plus a buffer
 * for loading, fuel and getting set up:
 *
 *     drive under 1 hour   →  drive + 20 min
 *     drive over 1 hour    →  drive + 30 min
 *     drive over 3 hours   →  drive + 45 min   (45 is the ceiling)
 *
 * ── What this is, honestly ───────────────────────────────────────────────────
 * This is an ESTIMATE, not a routed drive time. We do not call a paid directions
 * API. Two better inputs are used first when they exist:
 *
 *   1. `drive_distance_miles` on the job — a real road distance the office
 *      entered or a geocoder supplied. Preferred.
 *   2. Straight-line distance between the shop and the jobsite coordinates,
 *      inflated by a circuity factor because roads don't run in straight lines.
 *
 * Every result carries a `basis` saying which input produced it, so the UI can
 * present a rough estimate as rough rather than as a promise to a customer.
 */

export type EtaBasis =
  | 'road_distance'      // a real road distance was on file
  | 'straight_line'      // derived from coordinates
  | 'unavailable';       // not enough information to estimate

/**
 * Road distance is longer than the crow flies. ~1.25× is the well-established
 * circuity factor for US road networks; it keeps short local hops honest
 * without wildly inflating long hauls.
 */
export const CIRCUITY_FACTOR = 1.25;

/**
 * Average speed by trip length. A three-mile trip across town is stop-and-start;
 * a sixty-mile trip is mostly interstate. One flat speed would badly misjudge
 * both ends, so the band is chosen from the total distance.
 */
export function averageSpeedMph(roadMiles: number): number {
  if (roadMiles <= 5) return 22;    // in town, lights and turns
  if (roadMiles <= 20) return 32;   // suburban arterials
  if (roadMiles <= 60) return 48;   // mixed highway
  return 60;                        // sustained interstate
}

/** Drive time in minutes for a road distance, rounded to the minute. */
export function estimateDriveMinutes(roadMiles: number): number {
  if (!Number.isFinite(roadMiles) || roadMiles <= 0) return 0;
  return Math.round((roadMiles / averageSpeedMph(roadMiles)) * 60);
}

/**
 * The founder's buffer rule. Deliberately a step function, not a percentage —
 * this is how the crew actually thinks about it, and a rule people can predict
 * beats a formula they can't.
 */
export function arrivalBufferMinutes(driveMinutes: number): number {
  if (driveMinutes > 180) return 45;   // over 3 hours — and 45 is the ceiling
  if (driveMinutes > 60) return 30;    // over an hour
  return 20;                           // local
}

const EARTH_RADIUS_MILES = 3958.8;

/** Great-circle distance in miles between two points. */
export function straightLineMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface Coordinates {
  latitude: number | null | undefined;
  longitude: number | null | undefined;
}

export interface EtaInput {
  /** Where the crew leaves from. */
  shop?: Coordinates | null;
  /** Where they're going. */
  jobsite?: Coordinates | null;
  /** A real road distance on the job, when the office has one. Preferred. */
  driveDistanceMiles?: number | null;
  /** When the crew leaves. Defaults to now. */
  departAt?: Date;
}

export interface EtaResult {
  basis: EtaBasis;
  /** Road miles used for the calculation (null when unavailable). */
  miles: number | null;
  driveMinutes: number | null;
  bufferMinutes: number | null;
  /** Drive + buffer — what the customer should be told. */
  totalMinutes: number | null;
  /** Absolute arrival time, when a departure time is known. */
  arrivesAt: Date | null;
  /**
   * True when this came from coordinates rather than a real road distance, so
   * the UI can hedge the wording ("about 40 min") instead of stating it flatly.
   */
  approximate: boolean;
}

const UNAVAILABLE: EtaResult = {
  basis: 'unavailable',
  miles: null,
  driveMinutes: null,
  bufferMinutes: null,
  totalMinutes: null,
  arrivesAt: null,
  approximate: true,
};

function validCoord(c: Coordinates | null | undefined): c is { latitude: number; longitude: number } {
  return (
    !!c &&
    typeof c.latitude === 'number' &&
    typeof c.longitude === 'number' &&
    Number.isFinite(c.latitude) &&
    Number.isFinite(c.longitude) &&
    // 0,0 is in the Atlantic — it is always a missing value, never a jobsite.
    !(c.latitude === 0 && c.longitude === 0)
  );
}

/**
 * Work out when the crew should arrive.
 * Returns `basis: 'unavailable'` rather than guessing when there's nothing to
 * measure from — an invented arrival time told to a customer is worse than none.
 */
export function computeEta(input: EtaInput): EtaResult {
  const { shop, jobsite, driveDistanceMiles, departAt } = input;

  let miles: number | null = null;
  let basis: EtaBasis = 'unavailable';

  const onFile = Number(driveDistanceMiles);
  if (Number.isFinite(onFile) && onFile > 0) {
    miles = onFile;
    basis = 'road_distance';
  } else if (validCoord(shop) && validCoord(jobsite)) {
    miles =
      straightLineMiles(shop.latitude, shop.longitude, jobsite.latitude, jobsite.longitude) *
      CIRCUITY_FACTOR;
    basis = 'straight_line';
  }

  if (miles === null) return { ...UNAVAILABLE };

  const driveMinutes = estimateDriveMinutes(miles);
  const bufferMinutes = arrivalBufferMinutes(driveMinutes);
  const totalMinutes = driveMinutes + bufferMinutes;

  const depart = departAt ?? null;
  const arrivesAt = depart ? new Date(depart.getTime() + totalMinutes * 60_000) : null;

  return {
    basis,
    miles: Math.round(miles * 10) / 10,
    driveMinutes,
    bufferMinutes,
    totalMinutes,
    arrivesAt,
    approximate: basis !== 'road_distance',
  };
}

/**
 * "about 1 hr 5 min" — the phrasing a customer reads.
 * Kept here so the ticket, the portal and any notification word it identically.
 */
export function formatEtaDuration(totalMinutes: number | null): string {
  if (totalMinutes === null || !Number.isFinite(totalMinutes) || totalMinutes <= 0) return '';
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return h === 1 ? '1 hr' : `${h} hrs`;
  return `${h} hr${h > 1 ? 's' : ''} ${m} min`;
}

/** "7:45 AM" in the tenant's timezone. */
export function formatEtaClock(arrivesAt: Date | null, timeZone?: string): string {
  if (!arrivesAt) return '';
  return arrivesAt.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: timeZone || 'America/New_York',
  });
}
