'use client';

/**
 * LocationPermissionGuard
 *
 * Call `requestLocation()` before any GPS clock-in.
 * Returns coords on success, or throws a typed LocationError so callers
 * can show the right instructions rather than a generic error.
 *
 * Also exports <LocationBlockedModal> — drop it anywhere in the clock-in UI.
 */

import React, { useState } from 'react';
import { MapPin, X, Smartphone, Monitor, RefreshCw, AlertTriangle } from 'lucide-react';

export type LocationErrorKind =
  | 'permission_denied'   // user/OS blocked it
  | 'position_unavailable'// GPS hardware off / airplane mode
  | 'timeout'             // took too long
  | 'unsupported';        // browser has no geolocation API

export interface LocationResult {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export class LocationError extends Error {
  kind: LocationErrorKind;
  constructor(kind: LocationErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

/** Detect iOS so we can give the right settings path */
function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iP(hone|od|ad)/.test(navigator.userAgent);
}
function isAndroid(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android/.test(navigator.userAgent);
}

/**
 * Ask for the user's location.
 * - Checks Permissions API first so the browser doesn't re-prompt when already denied.
 * - Throws a typed LocationError with a kind so the UI can show specific instructions.
 */
export async function requestLocation(): Promise<LocationResult> {
  if (!navigator?.geolocation) {
    throw new LocationError('unsupported', 'Your browser does not support location services.');
  }

  // Pre-check permission state if the API is available (not Safari < 16)
  if (navigator.permissions) {
    try {
      const perm = await navigator.permissions.query({ name: 'geolocation' });
      if (perm.state === 'denied') {
        throw new LocationError(
          'permission_denied',
          'Location access has been blocked. Please enable it in your device settings.'
        );
      }
    } catch (e) {
      if (e instanceof LocationError) throw e;
      // Permissions API not available — fall through and let getCurrentPosition handle it
    }
  }

  return new Promise<LocationResult>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          reject(new LocationError('permission_denied', 'Location access denied.'));
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          reject(new LocationError('position_unavailable', 'Your device could not determine your location.'));
        } else if (err.code === err.TIMEOUT) {
          reject(new LocationError('timeout', 'Location request timed out. Please try again.'));
        } else {
          reject(new LocationError('position_unavailable', err.message));
        }
      },
      { timeout: 15000, enableHighAccuracy: true, maximumAge: 30000 }
    );
  });
}

// ── Modal ────────────────────────────────────────────────────────────────────

interface Props {
  errorKind: LocationErrorKind | null;
  onDismiss: () => void;
  onRetry: () => void;
}

export function LocationBlockedModal({ errorKind, onDismiss, onRetry }: Props) {
  if (!errorKind) return null;

  const ios = isIOS();
  const android = isAndroid();
  const desktop = !ios && !android;

  const title =
    errorKind === 'permission_denied' ? 'Location Access Blocked' :
    errorKind === 'position_unavailable' ? 'Location Unavailable' :
    errorKind === 'timeout' ? 'Location Timed Out' :
    'Location Not Supported';

  const icon =
    errorKind === 'permission_denied' ? <AlertTriangle className="w-7 h-7 text-amber-500" /> :
    <MapPin className="w-7 h-7 text-red-500" />;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-amber-50 dark:bg-amber-900/30 border-b border-amber-200 dark:border-amber-700/40 px-5 py-4 flex items-center gap-3">
          {icon}
          <div className="flex-1">
            <p className="font-bold text-gray-900 dark:text-white text-base">{title}</p>
            <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">Required for clock-in</p>
          </div>
          <button onClick={onDismiss} className="p-1.5 rounded-full hover:bg-amber-100 dark:hover:bg-amber-800/40 transition-colors">
            <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Instructions */}
        <div className="px-5 py-4 space-y-4">
          {errorKind === 'permission_denied' && (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Your location was blocked. Follow these steps to re-enable it, then try again:
              </p>

              {ios && (
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center gap-2 mb-1">
                    <Smartphone className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <p className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wide">iPhone / iPad</p>
                  </div>
                  <ol className="text-sm text-gray-700 dark:text-gray-300 space-y-1.5 list-none">
                    <li className="flex gap-2"><span className="font-bold text-blue-600 dark:text-blue-400 flex-shrink-0">1.</span>Open the <strong>Settings</strong> app</li>
                    <li className="flex gap-2"><span className="font-bold text-blue-600 dark:text-blue-400 flex-shrink-0">2.</span>Scroll down and tap <strong>Safari</strong> (or your browser)</li>
                    <li className="flex gap-2"><span className="font-bold text-blue-600 dark:text-blue-400 flex-shrink-0">3.</span>Tap <strong>Location</strong></li>
                    <li className="flex gap-2"><span className="font-bold text-blue-600 dark:text-blue-400 flex-shrink-0">4.</span>Select <strong>Ask Next Time</strong> or <strong>Allow</strong></li>
                    <li className="flex gap-2"><span className="font-bold text-blue-600 dark:text-blue-400 flex-shrink-0">5.</span>Come back and tap <strong>Try Again</strong> below</li>
                  </ol>
                </div>
              )}

              {android && (
                <div className="bg-green-50 dark:bg-green-900/20 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center gap-2 mb-1">
                    <Smartphone className="w-4 h-4 text-green-600 dark:text-green-400" />
                    <p className="text-xs font-bold text-green-700 dark:text-green-400 uppercase tracking-wide">Android</p>
                  </div>
                  <ol className="text-sm text-gray-700 dark:text-gray-300 space-y-1.5 list-none">
                    <li className="flex gap-2"><span className="font-bold text-green-600 dark:text-green-400 flex-shrink-0">1.</span>Tap the <strong>lock icon</strong> in the address bar</li>
                    <li className="flex gap-2"><span className="font-bold text-green-600 dark:text-green-400 flex-shrink-0">2.</span>Tap <strong>Permissions → Location</strong></li>
                    <li className="flex gap-2"><span className="font-bold text-green-600 dark:text-green-400 flex-shrink-0">3.</span>Change to <strong>Allow</strong></li>
                    <li className="flex gap-2"><span className="font-bold text-green-600 dark:text-green-400 flex-shrink-0">4.</span>Reload the page and tap <strong>Try Again</strong></li>
                  </ol>
                </div>
              )}

              {desktop && (
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center gap-2 mb-1">
                    <Monitor className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                    <p className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Chrome / Edge / Firefox</p>
                  </div>
                  <ol className="text-sm text-gray-700 dark:text-gray-300 space-y-1.5 list-none">
                    <li className="flex gap-2"><span className="font-bold text-slate-500 flex-shrink-0">1.</span>Click the <strong>lock 🔒</strong> or <strong>info ⓘ</strong> icon in the address bar</li>
                    <li className="flex gap-2"><span className="font-bold text-slate-500 flex-shrink-0">2.</span>Find <strong>Location</strong> and set it to <strong>Allow</strong></li>
                    <li className="flex gap-2"><span className="font-bold text-slate-500 flex-shrink-0">3.</span>Reload the page and tap <strong>Try Again</strong></li>
                  </ol>
                </div>
              )}
            </>
          )}

          {errorKind === 'position_unavailable' && (
            <div className="space-y-2">
              <p className="text-sm text-gray-600 dark:text-gray-300">Your device couldn't get a GPS fix. Try these:</p>
              <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1.5">
                <li className="flex gap-2">• Make sure <strong>Location Services</strong> is on in device settings</li>
                <li className="flex gap-2">• Move closer to a window or step outside briefly</li>
                <li className="flex gap-2">• Turn off Airplane Mode if it's on</li>
                <li className="flex gap-2">• Wait 10 seconds and tap <strong>Try Again</strong></li>
              </ul>
            </div>
          )}

          {errorKind === 'timeout' && (
            <p className="text-sm text-gray-600 dark:text-gray-300">
              GPS took too long to respond. Move to an area with better signal, then tap <strong>Try Again</strong>.
            </p>
          )}

          {errorKind === 'unsupported' && (
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Your browser doesn't support location services. Try opening this page in <strong>Chrome</strong> or <strong>Safari</strong>.
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="px-5 pb-5 flex gap-3">
          <button
            onClick={onDismiss}
            className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-white/20 text-gray-600 dark:text-gray-300 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onRetry}
            className="flex-1 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-bold flex items-center justify-center gap-2 hover:from-blue-700 hover:to-indigo-700 transition-all shadow"
          >
            <RefreshCw className="w-4 h-4" /> Try Again
          </button>
        </div>
      </div>
    </div>
  );
}
