'use client';

/**
 * NFCClockIn — Mobile-first clock-in component with 3 modes:
 *
 *  Mode 1 — NFC Scan (Android + Chrome with Web NFC API)
 *    - Large animated "Tap NFC Tag" button
 *    - NDEFReader scan on press; extracts serial number / NDEF text record
 *    - On successful scan: verifies against /api/timecard/verify-nfc, then clocks in
 *
 *  Mode 2 — Daily PIN (iOS or unsupported browsers)
 *    - Shown automatically when NDEFReader is unavailable
 *    - 6-digit PIN pad to prove on-site presence (admin sets daily PIN)
 *    - Calls /api/timecard/verify-pin, then /api/timecard/clock-in with method 'pin'
 *
 *  Mode 3 — Out-of-Town GPS Mode
 *    - Toggled by operator when traveling/at remote jobsite
 *    - Captures GPS coordinates, submits with requires_approval: true + method 'gps_remote'
 *    - Admin sees these in the timecards queue with amber "Remote" badge
 */

import { useState, useCallback } from 'react';
import {
  Wifi, MapPin, Smartphone, Loader2, CheckCircle, AlertTriangle,
  X, KeyRound, Navigation, ToggleLeft, ToggleRight
} from 'lucide-react';
import { useNFCScan } from '@/hooks/useNFCScan';
import { supabase } from '@/lib/supabase';

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

interface NFCClockInProps {
  onClockIn: (result: ClockInResult) => void;
  isShopContext?: boolean;   // if true, marks entry as shop hours
  disabled?: boolean;
}

// ── PIN pad digit layout ────────────────────────────────────────
const PIN_DIGITS = [
  ['1','2','3'],
  ['4','5','6'],
  ['7','8','9'],
  ['','0','⌫'],
];

// ── Helpers ────────────────────────────────────────────────────
async function getGPS(): Promise<{ latitude: number; longitude: number; accuracy?: number }> {
  if (process.env.NEXT_PUBLIC_BYPASS_LOCATION_CHECK === 'true') {
    return { latitude: 34.76866, longitude: -82.43563, accuracy: 0 };
  }
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ latitude: 0, longitude: 0 });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      }),
      () => resolve({ latitude: 0, longitude: 0 }),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
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
export default function NFCClockIn({ onClockIn, isShopContext = false, disabled = false }: NFCClockInProps) {
  const { isSupported, isScanning, startScan, stopScan, lastScan, error: nfcError, clearError } = useNFCScan();

  const [mode, setMode] = useState<'nfc' | 'pin' | 'gps_remote'>(isSupported ? 'nfc' : 'pin');
  const [remoteToggled, setRemoteToggled] = useState(false);
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  const showStatus = (msg: string, err = false) => {
    setStatusMessage(msg);
    setIsError(err);
  };

  // ── NFC scan triggered ──────────────────────────────────────
  const handleNFCScan = useCallback(async () => {
    if (disabled || loading) return;
    clearError();
    setStatusMessage(null);

    await startScan();
    // lastScan will update via the hook state once a tag is read
    // We watch for it below in useEffect — but since this is a single-function
    // component, we use a different approach: startScan completes when a tag
    // is found or errors. The lastScan state will trigger a re-render.
    // The actual submission is driven by the effect watching lastScan.
  }, [disabled, loading, clearError, startScan]);

  // Process NFC scan result when hook updates lastScan
  // We use a ref-tracked "processed" approach to avoid double-submit
  const lastScanId = lastScan?.timestamp;
  const processedScanRef = useState<string | null>(null);

  if (lastScan && lastScan.timestamp !== processedScanRef[0] && mode === 'nfc' && !loading) {
    processedScanRef[1](lastScan.timestamp);
    // Fire-and-forget async NFC verify + clock-in
    (async () => {
      if (!lastScan.tagUid) {
        showStatus('Could not read tag UID. Try again.', true);
        return;
      }
      setLoading(true);
      showStatus('Verifying NFC tag...');
      try {
        const headers = await getAuthHeaders();
        if (!headers) { showStatus('Please log in first.', true); setLoading(false); return; }

        // Verify the tag
        const verifyRes = await fetch('/api/timecard/verify-nfc', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            tag_uid: lastScan.tagUid,
            serial_number: lastScan.serialNumber,
          }),
        });
        const verifyJson = await verifyRes.json();

        if (!verifyRes.ok || !verifyJson.success) {
          showStatus(verifyJson.error || 'Tag not recognized.', true);
          setLoading(false);
          return;
        }

        showStatus('Clocking in...');
        const location = await getGPS();

        const clockRes = await fetch('/api/timecard/clock-in', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            clock_in_method: 'nfc',
            nfc_tag_uid: lastScan.tagUid,
            nfc_tag_serial: lastScan.serialNumber,
            nfc_tag_id: verifyJson.data?.tag_id,
            is_shop_hours: isShopContext || verifyJson.data?.tag_type === 'shop',
            latitude: location.latitude,
            longitude: location.longitude,
            accuracy: location.accuracy,
          }),
        });
        const clockJson = await clockRes.json();

        if (!clockRes.ok) {
          showStatus(clockJson.error || 'Clock-in failed.', true);
          setLoading(false);
          return;
        }

        onClockIn({
          success: true,
          timecardId: clockJson.data?.id,
          message: clockJson.message || 'Clocked in with NFC!',
          needsApproval: false,
        });
      } catch (err: any) {
        showStatus(err.message || 'Unexpected error.', true);
      }
      setLoading(false);
    })();
  }

  // ── PIN submit ──────────────────────────────────────────────
  const handlePinSubmit = useCallback(async () => {
    if (pin.length < 4 || disabled || loading) return;
    setLoading(true);
    showStatus('Verifying PIN...');
    try {
      const headers = await getAuthHeaders();
      if (!headers) { showStatus('Please log in first.', true); setLoading(false); return; }

      // Verify daily PIN
      const verifyRes = await fetch('/api/timecard/verify-pin', {
        method: 'POST',
        headers,
        body: JSON.stringify({ pin_code: pin }),
      });
      const verifyJson = await verifyRes.json();

      if (!verifyRes.ok || !verifyJson.success) {
        showStatus(verifyJson.error || 'Invalid PIN.', true);
        setPin('');
        setLoading(false);
        return;
      }

      showStatus('Clocking in...');
      const location = await getGPS();

      const clockRes = await fetch('/api/timecard/clock-in', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          clock_in_method: 'pin',
          is_shop_hours: isShopContext,
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy,
        }),
      });
      const clockJson = await clockRes.json();

      if (!clockRes.ok) {
        showStatus(clockJson.error || 'Clock-in failed.', true);
        setLoading(false);
        return;
      }

      onClockIn({
        success: true,
        timecardId: clockJson.data?.id,
        message: clockJson.message || 'Clocked in with PIN!',
        needsApproval: false,
      });
    } catch (err: any) {
      showStatus(err.message || 'Unexpected error.', true);
    }
    setLoading(false);
    setPin('');
  }, [pin, disabled, loading, isShopContext, onClockIn]);

  // ── GPS Remote submit ───────────────────────────────────────
  const handleGPSRemote = useCallback(async () => {
    if (disabled || loading) return;
    setLoading(true);
    showStatus('Getting your location...');
    try {
      const headers = await getAuthHeaders();
      if (!headers) { showStatus('Please log in first.', true); setLoading(false); return; }

      const location = await getGPS();
      if (!location.latitude && !location.longitude) {
        showStatus('Could not get GPS location. Enable location access and try again.', true);
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
    } catch (err: any) {
      showStatus(err.message || 'Unexpected error.', true);
    }
    setLoading(false);
  }, [disabled, loading, onClockIn]);

  // ── PIN pad digit press ─────────────────────────────────────
  const handleDigit = (d: string) => {
    if (d === '⌫') {
      setPin((p) => p.slice(0, -1));
    } else if (pin.length < 6) {
      setPin((p) => p + d);
    }
  };

  // ── Render ──────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* Mode toggle tabs */}
      <div className="flex justify-center gap-1 p-1 bg-slate-100 rounded-xl max-w-xs mx-auto">
        {isSupported && (
          <button
            onClick={() => { setMode('nfc'); setStatusMessage(null); stopScan(); }}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
              mode === 'nfc' ? 'bg-white shadow text-purple-700' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Wifi className="w-3.5 h-3.5" />
            NFC
          </button>
        )}
        <button
          onClick={() => { setMode('pin'); setStatusMessage(null); stopScan(); }}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
            mode === 'pin' ? 'bg-white shadow text-purple-700' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <KeyRound className="w-3.5 h-3.5" />
          PIN
        </button>
        <button
          onClick={() => { setMode('gps_remote'); setStatusMessage(null); stopScan(); }}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
            mode === 'gps_remote' ? 'bg-white shadow text-amber-700' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Navigation className="w-3.5 h-3.5" />
          Remote
        </button>
      </div>

      {/* ── Mode 1: NFC ──────────────────────────────────── */}
      {mode === 'nfc' && (
        <div className="text-center space-y-4 py-2">
          {!isScanning ? (
            <>
              <button
                onClick={handleNFCScan}
                disabled={disabled || loading}
                className="relative w-28 h-28 mx-auto rounded-full bg-gradient-to-br from-purple-500 to-violet-700 flex items-center justify-center shadow-xl hover:shadow-purple-500/30 transition-all active:scale-95 disabled:opacity-50 group"
              >
                {/* Subtle pulse when idle */}
                <div className="absolute inset-0 rounded-full bg-purple-400/20 group-hover:animate-ping" />
                {loading ? (
                  <Loader2 className="w-10 h-10 text-white animate-spin" />
                ) : (
                  <Wifi className="w-10 h-10 text-white" />
                )}
              </button>
              <div>
                <p className="text-sm font-bold text-slate-700">Tap to Scan NFC</p>
                <p className="text-xs text-slate-400 mt-0.5">Then hold your phone near the NFC chip</p>
              </div>
            </>
          ) : (
            <>
              {/* Scanning animation */}
              <div className="relative w-28 h-28 mx-auto flex items-center justify-center">
                <div className="absolute inset-0 rounded-full bg-purple-500/20 animate-ping" />
                <div className="absolute inset-2 rounded-full bg-purple-500/10 animate-pulse" style={{ animationDelay: '0.4s' }} />
                <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-purple-500 to-violet-700 flex items-center justify-center shadow-xl">
                  <Smartphone className="w-9 h-9 text-white" />
                </div>
              </div>
              <div>
                <p className="text-sm font-bold text-slate-700 animate-pulse">Hold phone near NFC tag...</p>
                <p className="text-xs text-slate-400 mt-0.5">Keep still for 1-2 seconds</p>
              </div>
              <button
                onClick={stopScan}
                className="flex items-center gap-1.5 mx-auto px-4 py-2 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all"
              >
                <X className="w-3.5 h-3.5" /> Cancel
              </button>
            </>
          )}

          {(nfcError) && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-left max-w-xs mx-auto">
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">{nfcError}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Mode 2: Daily PIN ─────────────────────────────── */}
      {mode === 'pin' && (
        <div className="text-center space-y-4 py-2">
          {!isSupported && (
            <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 max-w-xs mx-auto">
              <Smartphone className="w-4 h-4 flex-shrink-0" />
              <span>NFC unavailable on this device. Use today's shop PIN.</span>
            </div>
          )}

          {/* PIN display */}
          <div className="flex justify-center gap-2 py-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center text-lg font-bold transition-all ${
                  i < pin.length
                    ? 'border-purple-500 bg-purple-50 text-purple-700'
                    : 'border-slate-200 bg-slate-50 text-transparent'
                }`}
              >
                {i < pin.length ? '●' : '○'}
              </div>
            ))}
          </div>

          {/* PIN pad */}
          <div className="max-w-[200px] mx-auto space-y-2">
            {PIN_DIGITS.map((row, ri) => (
              <div key={ri} className="flex gap-2">
                {row.map((d, di) => (
                  <button
                    key={di}
                    onClick={() => d && handleDigit(d)}
                    disabled={!d || loading}
                    className={`flex-1 h-12 rounded-xl text-base font-bold transition-all ${
                      d
                        ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 active:scale-95'
                        : 'bg-transparent cursor-default'
                    } ${d === '⌫' ? 'text-red-500' : ''}`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            ))}
          </div>

          <button
            onClick={handlePinSubmit}
            disabled={pin.length < 4 || loading || disabled}
            className="w-full max-w-xs mx-auto py-3.5 bg-gradient-to-r from-purple-600 to-violet-700 text-white rounded-xl font-bold text-sm shadow-lg hover:shadow-purple-500/30 transition-all active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Clock In with PIN
          </button>
        </div>
      )}

      {/* ── Mode 3: GPS Remote ───────────────────────────── */}
      {mode === 'gps_remote' && (
        <div className="text-center space-y-4 py-2">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-left max-w-xs mx-auto space-y-2">
            <div className="flex items-center gap-2">
              <Navigation className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <p className="text-sm font-bold text-amber-800">Out-of-Town / Remote Mode</p>
            </div>
            <p className="text-xs text-amber-700 leading-relaxed">
              Use this when you're working remotely or at an out-of-town jobsite without an NFC chip.
              Your GPS coordinates will be saved and this clock-in will be flagged for admin approval.
            </p>
            <div className="flex items-center gap-2 pt-1">
              <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span className="text-xs font-semibold text-amber-700">Requires admin approval</span>
            </div>
          </div>

          {/* Confirm remote toggle */}
          <div className="flex items-center justify-center gap-3 py-1">
            <span className="text-sm text-slate-600">I confirm I&apos;m working remotely</span>
            <button
              onClick={() => setRemoteToggled((v) => !v)}
              className="transition-all"
            >
              {remoteToggled
                ? <ToggleRight className="w-8 h-8 text-amber-500" />
                : <ToggleLeft className="w-8 h-8 text-slate-300" />
              }
            </button>
          </div>

          <button
            onClick={handleGPSRemote}
            disabled={!remoteToggled || loading || disabled}
            className="w-full max-w-xs mx-auto py-3.5 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-xl font-bold text-sm shadow-lg hover:shadow-amber-500/30 transition-all active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
            Submit Remote Clock-In
          </button>
        </div>
      )}

      {/* Status / error messages */}
      {statusMessage && (
        <div className={`flex items-start gap-2 p-3 rounded-xl max-w-xs mx-auto text-left ${
          isError ? 'bg-red-50 border border-red-200' : 'bg-blue-50 border border-blue-200'
        }`}>
          {isError
            ? <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            : <Loader2 className="w-4 h-4 text-blue-500 animate-spin flex-shrink-0 mt-0.5" />
          }
          <p className={`text-xs ${isError ? 'text-red-700' : 'text-blue-700'}`}>{statusMessage}</p>
        </div>
      )}
    </div>
  );
}
