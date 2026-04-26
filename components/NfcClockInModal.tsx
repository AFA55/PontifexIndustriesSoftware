'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  X, Building2, Car, MapPin, Camera, Loader2,
  CheckCircle, AlertTriangle, ChevronLeft, Delete,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────

type ClockInMethod = 'nfc' | 'gps' | 'remote';

interface NfcClockInModalProps {
  isShopHours: boolean;
  /** True if the user is already clocked in — modal becomes clock-OUT modal */
  isClockedIn?: boolean;
  onClockIn: (data: {
    method: ClockInMethod;
    nfc_tag_id?: string;
    nfc_tag_uid?: string;
    remote_photo_url?: string;
    latitude: number;
    longitude: number;
    accuracy?: number;
  }) => Promise<void>;
  /** Called when user completes clock-OUT */
  onClockOut?: (data: {
    method: 'nfc' | 'gps';
    nfc_tag_id?: string;
    nfc_tag_uid?: string;
    latitude: number;
    longitude: number;
    accuracy?: number;
  }) => Promise<void>;
  onClose: () => void;
}

// Shop coordinates (hardcoded fallback — Greenville SC)
const SHOP_LAT = 34.76866;
const SHOP_LNG = -82.43563;
const SHOP_RADIUS_M = 200;

type Flow = 'choose' | 'shop_pin' | 'shop_gps' | 'jobsite_camera' | 'processing' | 'success';
type GpsStatus = 'idle' | 'acquiring' | 'ok' | 'outside' | 'error';

// ── Helpers ────────────────────────────────────────────────────────────────

function getLocation(): Promise<{ latitude: number; longitude: number; accuracy: number }> {
  if (process.env.NEXT_PUBLIC_BYPASS_LOCATION_CHECK === 'true') {
    return Promise.resolve({ latitude: SHOP_LAT, longitude: SHOP_LNG, accuracy: 0 });
  }
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported on this device'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      }),
      (err) => reject(new Error(err.message || 'Location unavailable')),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  });
}

function isNearShop(lat: number, lng: number): boolean {
  const distM = Math.sqrt((lat - SHOP_LAT) ** 2 + (lng - SHOP_LNG) ** 2) * 111_000;
  return distM < SHOP_RADIUS_M;
}

function formatTime(d: Date) {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatDateHeader(d: Date) {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

// ── Digit display ──────────────────────────────────────────────────────────

function PinDots({ length, filled }: { length: number; filled: number }) {
  return (
    <div className="flex gap-3 justify-center my-4">
      {Array.from({ length }).map((_, i) => (
        <div
          key={i}
          className={`w-11 h-14 rounded-xl border-2 flex items-center justify-center text-2xl font-bold transition-all duration-150 ${
            i < filled
              ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 scale-105'
              : 'border-slate-300 dark:border-white/20 bg-white dark:bg-white/5 text-transparent'
          }`}
        >
          {i < filled ? '●' : ''}
        </div>
      ))}
    </div>
  );
}

// ── Numpad ─────────────────────────────────────────────────────────────────

function NumPad({ onDigit, onBack }: { onDigit: (d: string) => void; onBack: () => void }) {
  const keys = ['1','2','3','4','5','6','7','8','9','','0','←'];

  return (
    <div className="grid grid-cols-3 gap-2 mt-2">
      {keys.map((k, i) => {
        if (k === '') return <div key={i} />;
        if (k === '←') {
          return (
            <button
              key={i}
              onClick={onBack}
              className="h-14 rounded-2xl bg-slate-100 dark:bg-white/10 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-white/20 active:scale-95 transition-all"
            >
              <Delete className="w-5 h-5 text-slate-600 dark:text-white/70" />
            </button>
          );
        }
        return (
          <button
            key={i}
            onClick={() => onDigit(k)}
            className="h-14 rounded-2xl bg-slate-100 dark:bg-white/10 text-2xl font-semibold text-slate-800 dark:text-white hover:bg-purple-100 dark:hover:bg-purple-800/40 active:scale-95 active:bg-purple-200 dark:active:bg-purple-700/50 transition-all"
          >
            {k}
          </button>
        );
      })}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function NfcClockInModal({
  isShopHours,
  isClockedIn = false,
  onClockIn,
  onClockOut,
  onClose,
}: NfcClockInModalProps) {
  const now = new Date();

  // ── State ──
  const [flow, setFlow] = useState<Flow>('choose');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinShake, setPinShake] = useState(false);
  const [pinVerifying, setPinVerifying] = useState(false);

  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('idle');
  const [gpsCoords, setGpsCoords] = useState<{ latitude: number; longitude: number; accuracy: number } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [showOutsideWarning, setShowOutsideWarning] = useState(false);

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [jobsiteGpsStatus, setJobsiteGpsStatus] = useState<GpsStatus>('idle');
  const [jobsiteCoords, setJobsiteCoords] = useState<{ latitude: number; longitude: number; accuracy: number } | null>(null);

  const [successTime, setSuccessTime] = useState('');
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clock-out convenience
  const isClockOut = isClockedIn && !!onClockOut;

  // ── Clock-OUT mode: reuse GPS path directly ──
  useEffect(() => {
    if (isClockOut) setFlow('choose');
  }, [isClockOut]);

  // ── PIN handlers ──
  const addDigit = useCallback((d: string) => {
    if (pin.length >= 6) return;
    setPinError(null);
    setPin((p) => p + d);
  }, [pin]);

  const removeDigit = useCallback(() => {
    setPinError(null);
    setPin((p) => p.slice(0, -1));
  }, []);

  const verifyPin = async () => {
    if (pin.length < 6) return;
    setPinVerifying(true);
    setPinError(null);
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';

      const res = await fetch('/api/timecard/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ pin_code: pin }),
      });
      const json = await res.json();

      if (json.success) {
        // Advance to GPS step
        setFlow('shop_gps');
        startShopGps();
      } else {
        // Shake + error
        setPinShake(true);
        setPinError(json.error || 'Invalid code. Try again.');
        setPin('');
        setTimeout(() => setPinShake(false), 600);
      }
    } catch {
      setPinShake(true);
      setPinError('Could not verify. Check your connection.');
      setPin('');
      setTimeout(() => setPinShake(false), 600);
    } finally {
      setPinVerifying(false);
    }
  };

  // ── Shop GPS ──
  const startShopGps = () => {
    setGpsStatus('acquiring');
    setGpsError(null);
    setShowOutsideWarning(false);

    getLocation()
      .then((coords) => {
        setGpsCoords(coords);
        if (isNearShop(coords.latitude, coords.longitude)) {
          setGpsStatus('ok');
        } else {
          setGpsStatus('outside');
          setShowOutsideWarning(true);
        }
      })
      .catch((err: Error) => {
        setGpsStatus('error');
        setGpsError(err.message);
      });
  };

  const confirmShopClockIn = async (coords: typeof gpsCoords) => {
    if (!coords) return;
    setFlow('processing');
    setGlobalError(null);
    try {
      await onClockIn({
        method: 'gps',
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy: coords.accuracy,
      });
      setSuccessTime(formatTime(new Date()));
      setRequiresApproval(false);
      setFlow('success');
    } catch (err: unknown) {
      setGlobalError(err instanceof Error ? err.message : 'Clock-in failed');
      setFlow('shop_gps');
    }
  };

  // ── Jobsite GPS (auto-acquire when entering camera flow, or on retry) ──
  useEffect(() => {
    if (flow === 'jobsite_camera' && jobsiteGpsStatus === 'idle') {
      setJobsiteGpsStatus('acquiring');
      getLocation()
        .then((c) => { setJobsiteCoords(c); setJobsiteGpsStatus('ok'); })
        .catch(() => setJobsiteGpsStatus('error'));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow, jobsiteGpsStatus]);

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const confirmJobsiteClockIn = async () => {
    // Allow clock-in even if GPS errored (no coords); photo is still required.
    if (!photoFile) return;
    setFlow('processing');
    setGlobalError(null);
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data: { session } } = await supabase.auth.getSession();

      // Upload photo
      const path = `remote-clockin/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
      const { error: uploadErr } = await supabase.storage
        .from('timecard-photos')
        .upload(path, photoFile, { contentType: photoFile.type });

      let photoUrl = '';
      if (!uploadErr) {
        const { data: { publicUrl } } = supabase.storage.from('timecard-photos').getPublicUrl(path);
        photoUrl = publicUrl;
      }

      // Delegate entirely to the parent callback — it owns the API call.
      // Passing null coords when GPS was unavailable; the backend accepts null
      // for remote/gps_remote methods and will flag for admin review.
      await onClockIn({
        method: 'remote',
        remote_photo_url: photoUrl || 'photo-upload-failed',
        latitude: jobsiteCoords?.latitude ?? 0,
        longitude: jobsiteCoords?.longitude ?? 0,
        accuracy: jobsiteCoords?.accuracy,
      });

      setSuccessTime(formatTime(new Date()));
      setRequiresApproval(true);
      setFlow('success');
    } catch (err: unknown) {
      setGlobalError(err instanceof Error ? err.message : 'Clock-in failed');
      setFlow('jobsite_camera');
    }
  };

  // ── Clock-OUT (GPS) ──
  const handleClockOut = async () => {
    if (!onClockOut) return;
    setFlow('processing');
    setGlobalError(null);
    try {
      const coords = await getLocation();
      await onClockOut({ method: 'gps', latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy });
      setSuccessTime(formatTime(new Date()));
      setRequiresApproval(false);
      setFlow('success');
    } catch (err: unknown) {
      setGlobalError(err instanceof Error ? err.message : 'Clock-out failed');
      setFlow('choose');
    }
  };

  // ── Shared UI bits ──
  const headerGradient = isClockOut
    ? 'bg-gradient-to-r from-orange-500 to-red-600'
    : 'bg-gradient-to-r from-purple-600 to-indigo-600';

  const headerTitle = isClockOut ? 'Clock Out' : 'Clock In';
  const headerSub = formatDateHeader(now);

  // ── Render ──
  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 flex items-center justify-center z-[70] p-4">
        <div className="bg-white dark:bg-[#0e0720] rounded-2xl shadow-2xl border border-white/10 max-w-sm w-full mx-4 overflow-hidden animate-in zoom-in-95 duration-200">

          {/* ── Header ── */}
          <div className={`${headerGradient} rounded-t-2xl p-5`}>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">{headerTitle}</h2>
                <p className="text-sm text-white/70">{headerSub}</p>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/20 rounded-xl transition-colors"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>
          </div>

          {/* ── Body ── */}
          <div className="p-5">

            {/* Global error */}
            {globalError && (
              <div className="flex items-start gap-2 p-3 mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/40 rounded-xl">
                <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-xs text-red-700 dark:text-red-300">{globalError}</p>
                  <button
                    onClick={() => { setGlobalError(null); setFlow('choose'); }}
                    className="text-xs text-red-600 dark:text-red-400 font-semibold underline mt-1"
                  >
                    Try Again
                  </button>
                </div>
              </div>
            )}

            {/* ════════════════════════════════ CHOOSE ════════════════════════════════ */}
            {flow === 'choose' && (
              <div className="space-y-3">
                {isClockOut ? (
                  // Clock-OUT: single GPS button
                  <>
                    <p className="text-sm text-slate-500 dark:text-white/50 text-center mb-4">
                      Tap below to clock out. GPS will record your location.
                    </p>
                    <button
                      onClick={handleClockOut}
                      className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-orange-200 dark:border-orange-700/40 bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100 dark:hover:bg-orange-800/30 transition-all text-left"
                    >
                      <div className="w-12 h-12 rounded-xl bg-orange-500 flex items-center justify-center flex-shrink-0">
                        <MapPin className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <p className="font-bold text-slate-900 dark:text-white">GPS Clock Out</p>
                        <p className="text-xs text-slate-500 dark:text-white/50">Records your location at clock-out</p>
                      </div>
                    </button>
                  </>
                ) : (
                  // Clock-IN: two options
                  <>
                    {/* Option A: Shop */}
                    <button
                      onClick={() => { setPin(''); setPinError(null); setFlow('shop_pin'); }}
                      className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-purple-200 dark:border-purple-700/40 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-800/30 transition-all text-left group"
                    >
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                        <Building2 className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-slate-900 dark:text-white">Shop Clock-In</p>
                        <p className="text-xs text-slate-500 dark:text-white/50">Enter daily code + GPS confirms you&apos;re at the shop</p>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-200 dark:bg-purple-700/50 text-purple-800 dark:text-purple-200 whitespace-nowrap">
                        STANDARD
                      </span>
                    </button>

                    {/* Option B: Direct to Jobsite */}
                    <button
                      onClick={() => {
                        setPhotoFile(null);
                        setPhotoPreview(null);
                        setJobsiteGpsStatus('idle');
                        setJobsiteCoords(null);
                        setFlow('jobsite_camera');
                      }}
                      className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-emerald-200 dark:border-emerald-700/40 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-800/30 transition-all text-left group"
                    >
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                        <Car className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-slate-900 dark:text-white">Direct to Jobsite</p>
                        <p className="text-xs text-slate-500 dark:text-white/50">Live photo + GPS <span className="text-amber-600 dark:text-amber-400">(requires approval)</span></p>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 whitespace-nowrap">
                        APPROVAL
                      </span>
                    </button>
                  </>
                )}
              </div>
            )}

            {/* ════════════════════════════════ SHOP PIN ════════════════════════════════ */}
            {flow === 'shop_pin' && (
              <div>
                <button
                  onClick={() => setFlow('choose')}
                  className="flex items-center gap-1 text-xs text-slate-400 dark:text-white/40 hover:text-purple-600 dark:hover:text-purple-400 mb-3 transition-colors"
                >
                  <ChevronLeft className="w-3 h-3" /> Back
                </button>

                <div className="text-center mb-1">
                  <h3 className="font-bold text-slate-900 dark:text-white text-base">Enter Today&apos;s Shop Code</h3>
                  <p className="text-xs text-slate-500 dark:text-white/50 mt-0.5">Get the code from your operations manager</p>
                </div>

                {/* 6-dot display */}
                <div className={pinShake ? 'animate-shake' : ''}>
                  <PinDots length={6} filled={pin.length} />
                </div>

                {/* Error */}
                {pinError && (
                  <p className="text-center text-xs text-red-500 dark:text-red-400 mb-2 font-semibold">{pinError}</p>
                )}

                {/* Numpad */}
                <NumPad onDigit={addDigit} onBack={removeDigit} />

                {/* Verify button */}
                <button
                  onClick={verifyPin}
                  disabled={pin.length < 6 || pinVerifying}
                  className="w-full mt-4 py-3.5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:from-purple-700 hover:to-indigo-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                  {pinVerifying ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Verifying…</>
                  ) : (
                    'Verify Code'
                  )}
                </button>
              </div>
            )}

            {/* ════════════════════════════════ SHOP GPS ════════════════════════════════ */}
            {flow === 'shop_gps' && (
              <div className="text-center py-2">
                <button
                  onClick={() => { setFlow('shop_pin'); setPin(''); }}
                  className="flex items-center gap-1 text-xs text-slate-400 dark:text-white/40 hover:text-purple-600 dark:hover:text-purple-400 mb-4 transition-colors"
                >
                  <ChevronLeft className="w-3 h-3" /> Back
                </button>

                {gpsStatus === 'acquiring' && (
                  <div className="space-y-4 py-4">
                    <div className="relative w-20 h-20 mx-auto">
                      <div className="absolute inset-0 rounded-full bg-purple-400/20 animate-ping" />
                      <div className="relative w-full h-full rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
                        <MapPin className="w-9 h-9 text-white" />
                      </div>
                    </div>
                    <p className="text-sm font-semibold text-slate-700 dark:text-white">Confirming your location…</p>
                    <p className="text-xs text-slate-400 dark:text-white/40">This may take a few seconds</p>
                  </div>
                )}

                {gpsStatus === 'ok' && gpsCoords && (
                  <div className="space-y-4 py-2">
                    <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                      <CheckCircle className="w-9 h-9 text-emerald-500" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 dark:text-white">Location confirmed</p>
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">You&apos;re at the shop — good to go!</p>
                    </div>
                    <button
                      onClick={() => confirmShopClockIn(gpsCoords)}
                      className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold text-sm hover:from-emerald-600 hover:to-teal-700 active:scale-[0.98] transition-all"
                    >
                      Clock In Now
                    </button>
                  </div>
                )}

                {gpsStatus === 'outside' && gpsCoords && (
                  <div className="space-y-3 py-2">
                    <div className="w-16 h-16 mx-auto rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                      <AlertTriangle className="w-9 h-9 text-amber-500" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 dark:text-white">Away from shop</p>
                      <p className="text-xs text-slate-500 dark:text-white/50 mt-0.5">
                        Your GPS signal places you outside the shop radius. Clock in anyway?
                      </p>
                    </div>
                    {showOutsideWarning && (
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => { setFlow('choose'); setGpsStatus('idle'); }}
                          className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-white font-semibold text-sm hover:bg-slate-200 dark:hover:bg-white/15 transition-colors"
                        >
                          No, Cancel
                        </button>
                        <button
                          onClick={() => confirmShopClockIn(gpsCoords)}
                          className="flex-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm active:scale-[0.98] transition-all"
                        >
                          Yes, Clock In
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {gpsStatus === 'error' && (
                  <div className="space-y-3 py-2">
                    <div className="w-16 h-16 mx-auto rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                      <AlertTriangle className="w-9 h-9 text-red-500" />
                    </div>
                    <p className="font-bold text-slate-900 dark:text-white">Location unavailable</p>
                    <p className="text-xs text-red-500 dark:text-red-400">{gpsError}</p>
                    <button
                      onClick={startShopGps}
                      className="w-full py-3 rounded-xl bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-white font-semibold text-sm hover:bg-slate-200 dark:hover:bg-white/15 transition-colors"
                    >
                      Retry GPS
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ════════════════════════════════ JOBSITE CAMERA ════════════════════════════════ */}
            {flow === 'jobsite_camera' && (
              <div className="space-y-4">
                <button
                  onClick={() => setFlow('choose')}
                  className="flex items-center gap-1 text-xs text-slate-400 dark:text-white/40 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
                >
                  <ChevronLeft className="w-3 h-3" /> Back
                </button>

                <div className="text-center">
                  <h3 className="font-bold text-slate-900 dark:text-white">Direct to Jobsite</h3>
                  <p className="text-xs text-slate-500 dark:text-white/50 mt-0.5">Take a photo to confirm your arrival</p>
                </div>

                {/* Camera capture */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoCapture}
                  className="hidden"
                />

                {photoPreview ? (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photoPreview}
                      alt="Arrival photo"
                      className="w-full h-44 object-cover rounded-xl border-2 border-emerald-300 dark:border-emerald-600"
                    />
                    <button
                      onClick={() => { setPhotoPreview(null); setPhotoFile(null); }}
                      className="absolute top-2 right-2 p-1 bg-red-500 hover:bg-red-600 text-white rounded-full transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    <div className="absolute bottom-2 left-2 bg-black/50 text-white text-[10px] px-2 py-0.5 rounded-full">
                      Photo ready
                    </div>
                  </div>
                ) : (
                  <label className="w-full h-44 border-2 border-dashed border-slate-300 dark:border-white/20 rounded-xl flex flex-col items-center justify-center gap-2 hover:border-emerald-400 dark:hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/10 transition-colors cursor-pointer">
                    <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                      <Camera className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <span className="text-sm font-semibold text-slate-600 dark:text-white/70">Take Photo</span>
                    <span className="text-[10px] text-slate-400 dark:text-white/40">📷 Live photo only — opens camera directly</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handlePhotoCapture}
                      className="hidden"
                    />
                  </label>
                )}

                {/* GPS status pill */}
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10">
                  <MapPin className={`w-4 h-4 flex-shrink-0 ${
                    jobsiteGpsStatus === 'ok' ? 'text-emerald-500' :
                    jobsiteGpsStatus === 'error' ? 'text-red-500' :
                    'text-slate-400 dark:text-white/30'
                  }`} />
                  <span className="text-xs text-slate-600 dark:text-white/60 flex-1">
                    {jobsiteGpsStatus === 'idle' && 'Waiting for GPS…'}
                    {jobsiteGpsStatus === 'acquiring' && 'Acquiring GPS…'}
                    {jobsiteGpsStatus === 'ok' && jobsiteCoords && `GPS ready — ±${Math.round(jobsiteCoords.accuracy)}m accuracy`}
                    {jobsiteGpsStatus === 'error' && 'GPS unavailable — location will be flagged for review'}
                  </span>
                  {jobsiteGpsStatus === 'acquiring' && (
                    <Loader2 className="w-3 h-3 animate-spin text-purple-500" />
                  )}
                  {jobsiteGpsStatus === 'ok' && (
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                  )}
                  {jobsiteGpsStatus === 'error' && (
                    <button
                      onClick={() => {
                        setJobsiteGpsStatus('idle');
                        setJobsiteCoords(null);
                      }}
                      className="text-[10px] text-purple-500 hover:text-purple-700 dark:text-purple-400 font-semibold underline flex-shrink-0"
                    >
                      Retry
                    </button>
                  )}
                </div>

                <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3 border border-amber-200 dark:border-amber-700/40">
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    <strong>Needs approval:</strong> Direct jobsite clock-ins are reviewed by your operations manager before pay is processed.
                  </p>
                </div>

                <button
                  onClick={confirmJobsiteClockIn}
                  disabled={!photoFile || jobsiteGpsStatus === 'acquiring' || jobsiteGpsStatus === 'idle'}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:from-emerald-600 hover:to-teal-700 active:scale-[0.98] transition-all"
                >
                  Clock In (Needs Approval)
                </button>
              </div>
            )}

            {/* ════════════════════════════════ PROCESSING ════════════════════════════════ */}
            {flow === 'processing' && (
              <div className="text-center py-10">
                <Loader2 className="w-10 h-10 animate-spin mx-auto mb-3 text-purple-500" />
                <p className="text-slate-700 dark:text-white font-semibold">
                  {isClockOut ? 'Clocking you out…' : 'Clocking you in…'}
                </p>
                <p className="text-xs text-slate-400 dark:text-white/40 mt-1">Verifying and recording…</p>
              </div>
            )}

            {/* ════════════════════════════════ SUCCESS ════════════════════════════════ */}
            {flow === 'success' && (
              <div className="text-center py-6 space-y-4">
                <div className="w-20 h-20 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                  <CheckCircle className="w-11 h-11 text-emerald-500" />
                </div>
                <div>
                  <p className="text-lg font-bold text-slate-900 dark:text-white">
                    {isClockOut ? 'Clocked Out Successfully!' : 'Clocked In Successfully!'}
                  </p>
                  <p className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-1">{successTime}</p>
                  {requiresApproval && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 font-semibold">
                      Pending supervisor approval
                    </p>
                  )}
                </div>
                <button
                  onClick={onClose}
                  className="w-full py-3 rounded-2xl bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-white font-bold text-sm hover:bg-slate-200 dark:hover:bg-white/15 transition-colors"
                >
                  Close
                </button>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* Shake keyframe (inlined so no Tailwind plugin needed) */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          15%       { transform: translateX(-6px); }
          30%       { transform: translateX(6px); }
          45%       { transform: translateX(-5px); }
          60%       { transform: translateX(5px); }
          75%       { transform: translateX(-3px); }
          90%       { transform: translateX(3px); }
        }
        .animate-shake { animation: shake 0.55s ease-in-out; }
      `}</style>
    </>
  );
}
