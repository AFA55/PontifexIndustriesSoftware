'use client';

/**
 * GpsClockIn — Mobile-first clock-in component with 2 modes:
 *
 *  Mode 1 — Clock In at Shop (GPS, primary)
 *    - Big primary button; requests location, clocks in with method 'gps'
 *    - Server validates the operator is within the shop radius
 *    - Out of radius → server 403 with distance details, shown inline
 *
 *  Mode 2 — Out-of-Town / Remote
 *    - Toggled by operator when traveling/at a remote jobsite
 *    - Captures GPS coordinates, submits with requires_approval: true + method 'gps_remote'
 *    - Admin sees these in the timecards queue with an amber "Remote" badge
 *
 * NFC scanning and daily shop PINs were retired (June 2026). Server-side
 * support for those methods remains in /api/timecard/clock-in for other
 * tenants — the UI just never sends them anymore.
 */

import { useState, useCallback } from 'react';
import {
  MapPin, Loader2, AlertTriangle, Navigation, ToggleLeft, ToggleRight,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { SHOP_LOCATION, isLocationBypassActive } from '@/lib/geolocation';
import {
  requestLocation, LocationError, type LocationErrorKind, type LocationResult,
} from '@/components/ui/LocationPermissionGuard';

// ── Types ──────────────────────────────────────────────────────
export type ClockInResult = {
  success: true;
  timecardId: string;
  message: string;
  needsApproval: boolean;
} | {
  success: false;
  error: string;
};

interface GpsClockInProps {
  onClockIn: (result: ClockInResult) => void;
  isShopContext?: boolean;   // if true, marks entry as shop hours
  disabled?: boolean;
  /** Optional: surface typed location errors (denied/unavailable/timeout)
   *  so the page can show the device-specific LocationBlockedModal. */
  onLocationError?: (kind: LocationErrorKind) => void;
}

// ── Helpers ────────────────────────────────────────────────────
async function getLocation(): Promise<LocationResult> {
  if (isLocationBypassActive()) {
    return { latitude: SHOP_LOCATION.latitude, longitude: SHOP_LOCATION.longitude, accuracy: 0 };
  }
  return requestLocation(); // throws typed LocationError on denial/unavailable/timeout
}

async function getAuthHeaders(): Promise<Record<string, string> | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.access_token}`,
  };
}

// ── Main Component ─────────────────────────────────────────────
export default function GpsClockIn({ onClockIn, isShopContext = false, disabled = false, onLocationError }: GpsClockInProps) {
  const [mode, setMode] = useState<'gps' | 'gps_remote'>('gps');
  const [remoteToggled, setRemoteToggled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [showRemoteHint, setShowRemoteHint] = useState(false);

  const showStatus = (msg: string, err = false) => {
    setStatusMessage(msg);
    setIsError(err);
  };

  // ── GPS shop clock-in (primary) ─────────────────────────────
  const handleGPSShop = useCallback(async () => {
    if (disabled || loading) return;
    setLoading(true);
    setShowRemoteHint(false);
    showStatus('Getting your location...');
    try {
      const headers = await getAuthHeaders();
      if (!headers) { showStatus('Please log in first.', true); setLoading(false); return; }

      let location: LocationResult;
      try {
        location = await getLocation();
      } catch (locErr: any) {
        showStatus(locErr.message || 'Could not get GPS location. Enable location access and try again.', true);
        if (locErr instanceof LocationError) onLocationError?.(locErr.kind);
        setLoading(false);
        return;
      }

      showStatus('Clocking in...');

      const clockRes = await fetch('/api/timecard/clock-in', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          clock_in_method: 'gps',
          is_shop_hours: isShopContext,
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy,
        }),
      });
      const clockJson = await clockRes.json();

      if (!clockRes.ok) {
        // Out-of-radius 403 includes error + distance details
        const msg = [clockJson.error, clockJson.details].filter(Boolean).join(' ') || 'Clock-in failed.';
        showStatus(msg, true);
        setShowRemoteHint(clockRes.status === 403);
        setLoading(false);
        return;
      }

      onClockIn({
        success: true,
        timecardId: clockJson.data?.id,
        message: clockJson.message || 'Clocked in!',
        needsApproval: false,
      });
      setStatusMessage(null);
    } catch (err: any) {
      showStatus(err.message || 'Unexpected error.', true);
    }
    setLoading(false);
  }, [disabled, loading, isShopContext, onClockIn, onLocationError]);

  // ── GPS Remote submit ───────────────────────────────────────
  const handleGPSRemote = useCallback(async () => {
    if (disabled || loading) return;
    setLoading(true);
    showStatus('Getting your location...');
    try {
      const headers = await getAuthHeaders();
      if (!headers) { showStatus('Please log in first.', true); setLoading(false); return; }

      let location: LocationResult;
      try {
        location = await getLocation();
      } catch (locErr: any) {
        showStatus(locErr.message || 'Could not get GPS location. Enable location access and try again.', true);
        if (locErr instanceof LocationError) onLocationError?.(locErr.kind);
        setLoading(false);
        return;
      }

      showStatus('Submitting remote clock-in for approval...');

      const clockRes = await fetch('/api/timecard/clock-in', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          clock_in_method: 'gps_remote',
          requires_approval: true,
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy,
          is_shop_hours: false,
        }),
      });
      const clockJson = await clockRes.json();

      if (!clockRes.ok) {
        showStatus(clockJson.error || 'Remote clock-in failed.', true);
        setLoading(false);
        return;
      }

      onClockIn({
        success: true,
        timecardId: clockJson.data?.id,
        message: 'Remote clock-in submitted. Pending admin approval.',
        needsApproval: true,
      });
      setStatusMessage(null);
    } catch (err: any) {
      showStatus(err.message || 'Unexpected error.', true);
    }
    setLoading(false);
  }, [disabled, loading, onClockIn, onLocationError]);

  // ── Render ──────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* Mode toggle tabs */}
      <div className="flex justify-center gap-1 p-1 bg-slate-100 dark:bg-white/10 rounded-xl max-w-xs mx-auto">
        <button
          onClick={() => { setMode('gps'); setStatusMessage(null); setShowRemoteHint(false); }}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 min-h-[44px] rounded-lg text-xs font-semibold transition-all ${
            mode === 'gps'
              ? 'bg-white dark:bg-white/20 shadow text-purple-700 dark:text-purple-300'
              : 'text-slate-500 dark:text-white/50 hover:text-slate-700 dark:hover:text-white/80'
          }`}
        >
          <MapPin className="w-3.5 h-3.5" />
          At Shop
        </button>
        <button
          onClick={() => { setMode('gps_remote'); setStatusMessage(null); setShowRemoteHint(false); }}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 min-h-[44px] rounded-lg text-xs font-semibold transition-all ${
            mode === 'gps_remote'
              ? 'bg-white dark:bg-white/20 shadow text-amber-700 dark:text-amber-300'
              : 'text-slate-500 dark:text-white/50 hover:text-slate-700 dark:hover:text-white/80'
          }`}
        >
          <Navigation className="w-3.5 h-3.5" />
          Remote
        </button>
      </div>

      {/* ── Mode 1: GPS at shop (primary) ─────────────────── */}
      {mode === 'gps' && (
        <div className="text-center space-y-4 py-2">
          <button
            onClick={handleGPSShop}
            disabled={disabled || loading}
            className="w-full max-w-xs mx-auto py-4 min-h-[56px] bg-gradient-to-r from-purple-600 to-violet-700 text-white rounded-xl font-bold text-lg shadow-lg hover:shadow-purple-500/30 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <MapPin className="w-5 h-5" />}
            Clock In at Shop
          </button>
          <p className="text-xs text-slate-400 dark:text-white/40">
            Uses your location to verify you&apos;re at {SHOP_LOCATION.name}
          </p>

          {showRemoteHint && (
            <button
              onClick={() => { setMode('gps_remote'); setStatusMessage(null); setShowRemoteHint(false); }}
              className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2 text-xs font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-xl hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-all"
            >
              <Navigation className="w-3.5 h-3.5" />
              At an out-of-town jobsite? Use Remote clock-in
            </button>
          )}
        </div>
      )}

      {/* ── Mode 2: GPS Remote ───────────────────────────── */}
      {mode === 'gps_remote' && (
        <div className="text-center space-y-4 py-2">
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-2xl p-4 text-left max-w-xs mx-auto space-y-2">
            <div className="flex items-center gap-2">
              <Navigation className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
              <p className="text-sm font-bold text-amber-800 dark:text-amber-300">Out-of-Town / Remote Mode</p>
            </div>
            <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
              Use this when you&apos;re working remotely or at an out-of-town jobsite.
              Your GPS coordinates will be saved and this clock-in will be flagged for admin approval.
            </p>
            <div className="flex items-center gap-2 pt-1">
              <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">Requires admin approval</span>
            </div>
          </div>

          {/* Confirm remote toggle */}
          <div className="flex items-center justify-center gap-3 py-1">
            <span className="text-sm text-slate-600 dark:text-white/60">I confirm I&apos;m working remotely</span>
            <button
              onClick={() => setRemoteToggled((v) => !v)}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center transition-all"
            >
              {remoteToggled
                ? <ToggleRight className="w-8 h-8 text-amber-500" />
                : <ToggleLeft className="w-8 h-8 text-slate-300 dark:text-white/30" />
              }
            </button>
          </div>

          <button
            onClick={handleGPSRemote}
            disabled={!remoteToggled || loading || disabled}
            className="w-full max-w-xs mx-auto py-3.5 min-h-[52px] bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-xl font-bold text-sm shadow-lg hover:shadow-amber-500/30 transition-all active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
            Submit Remote Clock-In
          </button>
        </div>
      )}

      {/* Status / error messages */}
      {statusMessage && (
        <div className={`flex items-start gap-2 p-3 rounded-xl max-w-xs mx-auto text-left ${
          isError
            ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/50'
            : 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/50'
        }`}>
          {isError
            ? <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            : <Loader2 className="w-4 h-4 text-blue-500 animate-spin flex-shrink-0 mt-0.5" />
          }
          <p className={`text-xs ${isError ? 'text-red-700 dark:text-red-400' : 'text-blue-700 dark:text-blue-400'}`}>{statusMessage}</p>
        </div>
      )}
    </div>
  );
}
