'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Truck, MapPin, Navigation, AlertCircle, CheckCircle2 } from 'lucide-react';

// ─── Endpoint contract ──────────────────────────────────────────────────────────
// GET /api/public/portal/[token]/location?jobId=
//   { active: false }                                              ← operator not en route
//   { active: true,
//     operator: { latitude, longitude, recorded_at, stale },      ← last-known ping
//     destination: { latitude, longitude } | null,                ← jobsite coords (may be null)
//     operator_first_name }
// We code strictly to this shape; anything unexpected → render nothing.

interface LocationCoords {
  latitude: number;
  longitude: number;
}

interface LocationResponse {
  active: boolean;
  operator?: {
    latitude: number;
    longitude: number;
    recorded_at: string;
    stale: boolean;
  };
  destination?: LocationCoords | null;
  operator_first_name?: string | null;
}

interface LiveRouteTrackerProps {
  token: string;
  jobId: string;
  /** Tenant primary color (hex) for the branded accent. No hardcoded purple. */
  primaryColor?: string | null;
  /** Optional destination address — display only (the haversine math uses coords). */
  destinationAddress?: string | null;
}

// Poll cadence while the tab is visible. ~28s keeps it lively without hammering.
const POLL_INTERVAL_MS = 28_000;
// Assumed average local-driving speed for the crude ETA (mph).
const ASSUMED_SPEED_MPH = 30;

// ─── Geo helpers ────────────────────────────────────────────────────────────────

// Great-circle distance in miles between two lat/lng points.
function haversineMiles(a: LocationCoords, b: LocationCoords): number {
  const R = 3958.8; // Earth radius, miles
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function formatDistance(miles: number): string {
  if (miles < 0.1) return 'less than 0.1 mi';
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}

// Straight-line distance ÷ assumed speed. Deliberately crude — labeled "~" everywhere.
function crudeEtaMinutes(miles: number): number {
  const mins = (miles / ASSUMED_SPEED_MPH) * 60;
  return Math.max(1, Math.round(mins));
}

function formatEta(minutes: number): string {
  if (minutes < 60) return `~${minutes} min away`;
  const hr = Math.floor(minutes / 60);
  const min = minutes % 60;
  return min === 0 ? `~${hr} hr away` : `~${hr} hr ${min} min away`;
}

// "updated Xs ago" — relative, self-contained (no external date dep on this public page).
function relativeUpdated(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const sec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (sec < 10) return 'updated just now';
  if (sec < 60) return `updated ${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `updated ${min} min ago`;
  const hr = Math.round(min / 60);
  return `updated ${hr} hr ago`;
}

// ─── Component ──────────────────────────────────────────────────────────────────

export default function LiveRouteTracker({
  token,
  jobId,
  primaryColor,
  destinationAddress,
}: LiveRouteTrackerProps) {
  const [data, setData] = useState<LocationResponse | null>(null);
  // Drives only the loading skeleton on first paint; thereafter we update silently.
  const [hasLoaded, setHasLoaded] = useState(false);
  // True once the endpoint reports active:false → we render the subtle "completed" note
  // and stop polling. Distinct from "never started" (data===null), which renders nothing.
  const [endedAfterActive, setEndedAfterActive] = useState(false);
  // Re-render tick so "updated Xs ago" stays fresh between polls.
  const [, setTick] = useState(0);

  const accent = primaryColor || undefined;

  // Keep stable refs the polling loop can read without re-subscribing.
  const stoppedRef = useRef(false);
  const sawActiveRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchLocation = useCallback(async () => {
    if (stoppedRef.current) return;
    try {
      const res = await fetch(
        `/api/public/portal/${token}/location?jobId=${encodeURIComponent(jobId)}`,
        { cache: 'no-store' }
      );
      if (!res.ok) {
        // Endpoint unavailable / token issue → fail quiet. Keep last good state if any.
        setHasLoaded(true);
        return;
      }
      const json: LocationResponse = await res.json();

      if (!json || json.active !== true) {
        // No longer en route. If we'd previously shown an active route, leave a
        // reassuring "arrived/completed" note; otherwise render nothing at all.
        stoppedRef.current = true;
        if (timerRef.current) clearTimeout(timerRef.current);
        setEndedAfterActive(sawActiveRef.current);
        setData(null);
        setHasLoaded(true);
        return;
      }

      sawActiveRef.current = true;
      setData(json);
      setHasLoaded(true);
    } catch {
      // Network blip → keep prior state, try again next cycle.
      setHasLoaded(true);
    }
  }, [token, jobId]);

  // ── Visibility-gated polling loop ──────────────────────────────────────────────
  useEffect(() => {
    if (!token || !jobId) return;
    stoppedRef.current = false;

    const tick = async () => {
      if (stoppedRef.current) return;
      if (document.visibilityState === 'visible') {
        await fetchLocation();
      }
      if (stoppedRef.current) return;
      timerRef.current = setTimeout(tick, POLL_INTERVAL_MS);
    };

    // Kick off immediately if visible; otherwise wait for the visibility handler.
    if (document.visibilityState === 'visible') {
      fetchLocation();
    }
    timerRef.current = setTimeout(tick, POLL_INTERVAL_MS);

    // When the tab becomes visible again, refresh right away (don't wait a full cycle).
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !stoppedRef.current) {
        fetchLocation();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stoppedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [token, jobId, fetchLocation]);

  // ── Keep the "updated Xs ago" label ticking once per active route ───────────────
  useEffect(() => {
    if (!data?.active) return;
    const id = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => clearInterval(id);
  }, [data?.active]);

  // ── Render gates ────────────────────────────────────────────────────────────────

  // Nothing has resolved yet → no skeleton flash (the page may never show this card).
  if (!hasLoaded && !data) return null;

  // Was active, now finished → subtle, reassuring note.
  if (endedAfterActive && !data) {
    return (
      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 flex items-center gap-3">
        <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
        <p className="text-sm text-emerald-200">Your technician has arrived.</p>
      </div>
    );
  }

  // No active route (and never was) → render nothing; the card self-hides.
  if (!data || !data.active || !data.operator) return null;

  const firstName = (data.operator_first_name || '').trim();
  const onTheWayLine = firstName
    ? `${firstName} is on the way`
    : 'Your technician is on the way';

  const operatorCoords: LocationCoords = {
    latitude: data.operator.latitude,
    longitude: data.operator.longitude,
  };
  const dest = data.destination ?? null;

  let distanceMiles: number | null = null;
  let etaMinutes: number | null = null;
  if (
    dest &&
    Number.isFinite(operatorCoords.latitude) &&
    Number.isFinite(operatorCoords.longitude) &&
    Number.isFinite(dest.latitude) &&
    Number.isFinite(dest.longitude)
  ) {
    distanceMiles = haversineMiles(operatorCoords, dest);
    etaMinutes = crudeEtaMinutes(distanceMiles);
  }

  const stale = data.operator.stale;

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
      {/* ── Branded header band ──────────────────────────────────────────────── */}
      <div
        className="bg-brand px-5 py-4 flex items-center gap-3"
        style={accent ? { backgroundColor: accent } : undefined}
      >
        {/* Pulsing en-route indicator */}
        <span className="relative flex h-10 w-10 items-center justify-center flex-shrink-0">
          <span className="absolute inline-flex h-full w-full rounded-full bg-white/40 opacity-75 animate-ping" />
          <span className="relative inline-flex h-10 w-10 rounded-full bg-white/20 items-center justify-center">
            <Truck className="w-5 h-5 text-white" />
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold text-white leading-tight break-words">
            {onTheWayLine}
          </p>
          {etaMinutes != null ? (
            <p className="text-sm text-white/85 mt-0.5">{formatEta(etaMinutes)}</p>
          ) : (
            <p className="text-sm text-white/85 mt-0.5">Heading to your location</p>
          )}
        </div>
      </div>

      {/* ── Detail row ───────────────────────────────────────────────────────── */}
      <div className="px-5 py-4 space-y-3">
        {distanceMiles != null && (
          <div className="flex items-center gap-2 text-sm text-slate-300">
            <Navigation className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <span>
              About <span className="font-semibold text-white">{formatDistance(distanceMiles)}</span> away
            </span>
          </div>
        )}

        {destinationAddress && (
          <div className="flex items-start gap-2 text-sm text-slate-300">
            <MapPin className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
            <span className="break-words">{destinationAddress}</span>
          </div>
        )}

        {/* Last-updated + staleness */}
        <div className="flex items-center gap-2 pt-1">
          {stale ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-amber-300">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              Location may be delayed
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              Live
            </span>
          )}
          <span aria-hidden className="text-slate-600">·</span>
          <span className="text-xs text-slate-500">{relativeUpdated(data.operator.recorded_at)}</span>
        </div>

        <p className="text-[11px] text-slate-600 leading-snug">
          Distance and arrival time are estimates based on a direct route.
        </p>
      </div>

      {/*
        ── v2 (future): live Google map marker ──────────────────────────────────
        A map would mount HERE, below the detail row, rendering two markers
        (operator `operatorCoords` + `dest`) and recentering on each poll.
        IMPORTANT: do NOT add `@react-google-maps/api` (banned — retry-loop +
        keyless-array warnings). Use the project's single-flight loader pattern:
        mount a portal-scoped GoogleMapsProvider, then
        `google.maps.importLibrary('maps','marker')` and place AdvancedMarkers.
        Degrade to this v1 lightweight view on loadError (localhost referrer block).
      */}
    </div>
  );
}
