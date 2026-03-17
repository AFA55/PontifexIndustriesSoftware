'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  X, Wifi, WifiOff, MapPin, Camera, Loader2, CheckCircle,
  AlertTriangle, Building2, Smartphone
} from 'lucide-react';

type ClockInMethod = 'nfc' | 'gps' | 'remote';

interface NfcTagResult {
  tag_id: string;
  tag_uid: string;
  tag_type: string;
  label: string;
  truck_number?: string;
}

interface NfcClockInModalProps {
  isShopHours: boolean;
  onClockIn: (data: {
    method: ClockInMethod;
    nfc_tag_id?: string;
    nfc_tag_uid?: string;
    remote_photo_url?: string;
    latitude: number;
    longitude: number;
    accuracy?: number;
  }) => Promise<void>;
  onClose: () => void;
}

export default function NfcClockInModal({ isShopHours, onClockIn, onClose }: NfcClockInModalProps) {
  const [step, setStep] = useState<'choose' | 'nfc_scan' | 'remote_photo' | 'processing'>('choose');
  const [nfcSupported, setNfcSupported] = useState(false);
  const [nfcScanning, setNfcScanning] = useState(false);
  const [nfcTag, setNfcTag] = useState<NfcTagResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const nfcReaderRef = useRef<unknown>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'NDEFReader' in window) {
      setNfcSupported(true);
    }
  }, []);

  // ── NFC Scanning ──
  const startNfcScan = useCallback(async () => {
    setStep('nfc_scan');
    setNfcScanning(true);
    setError(null);
    setNfcTag(null);

    try {
      const ndef = new (window as unknown as { NDEFReader: new () => { scan: () => Promise<void>; addEventListener: (event: string, handler: (e: unknown) => void) => void } }).NDEFReader();
      nfcReaderRef.current = ndef;
      await ndef.scan();

      ndef.addEventListener('reading', async (e: unknown) => {
        const event = e as { serialNumber: string; message?: { records?: { recordType: string; data: BufferSource }[] } };
        let lookupValue = event.serialNumber;

        // Check if message contains our written tag data
        if (event.message?.records) {
          for (const record of event.message.records) {
            if (record.recordType === 'text') {
              const decoder = new TextDecoder();
              const text = decoder.decode(record.data);
              if (text.startsWith('CLK-') || text.startsWith('PX-')) {
                lookupValue = text;
                break;
              }
            }
          }
        }

        setNfcScanning(false);

        // Verify the tag with our API
        try {
          const { supabase } = await import('@/lib/supabase');
          const { data: session } = await supabase.auth.getSession();
          const token = session.session?.access_token || '';

          const res = await fetch('/api/timecard/verify-nfc', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ tag_uid: lookupValue, serial_number: event.serialNumber }),
          });

          const json = await res.json();

          if (json.success && json.data) {
            setNfcTag(json.data);
            // Auto-proceed to clock in
            handleNfcClockIn(json.data);
          } else {
            setError(json.error || 'NFC tag not recognized');
          }
        } catch {
          setError('Failed to verify NFC tag');
        }
      });

      ndef.addEventListener('readingerror', () => {
        setError('Could not read NFC tag. Try again.');
        setNfcScanning(false);
      });
    } catch {
      setError('NFC not available on this device. Try GPS or Remote clock-in.');
      setNfcScanning(false);
      setStep('choose');
    }
  }, []);

  const stopNfcScan = () => {
    nfcReaderRef.current = null;
    setNfcScanning(false);
    setStep('choose');
  };

  // ── Handle NFC Clock In ──
  const handleNfcClockIn = async (tag: NfcTagResult) => {
    setStep('processing');
    setError(null);

    try {
      // Get location (still useful for logging)
      const location = await getLocation();

      await onClockIn({
        method: 'nfc',
        nfc_tag_id: tag.tag_id,
        nfc_tag_uid: tag.tag_uid,
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Clock-in failed');
      setStep('choose');
    }
  };

  // ── Handle GPS Clock In ──
  const handleGpsClockIn = async () => {
    setStep('processing');
    setError(null);

    try {
      const location = await getLocation();

      await onClockIn({
        method: 'gps',
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Clock-in failed');
      setStep('choose');
    }
  };

  // ── Handle Remote Clock In ──
  const handleRemoteClockIn = async () => {
    if (!photoFile) {
      setError('Please take a selfie photo first');
      return;
    }

    setStep('processing');
    setError(null);

    try {
      const location = await getLocation();

      // Upload photo to Supabase Storage
      const { supabase } = await import('@/lib/supabase');
      const filename = `remote-clockin/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
      const { error: uploadErr } = await supabase.storage
        .from('timecard-photos')
        .upload(filename, photoFile, { contentType: photoFile.type });

      let photoUrl = '';
      if (!uploadErr) {
        const { data: urlData } = supabase.storage.from('timecard-photos').getPublicUrl(filename);
        photoUrl = urlData.publicUrl;
      }

      await onClockIn({
        method: 'remote',
        remote_photo_url: photoUrl || 'photo-upload-failed',
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Clock-in failed');
      setStep('choose');
    }
  };

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  // Helper — get GPS location
  const getLocation = (): Promise<{ latitude: number; longitude: number; accuracy?: number }> => {
    // Check bypass mode
    if (process.env.NEXT_PUBLIC_BYPASS_LOCATION_CHECK === 'true') {
      return Promise.resolve({ latitude: 34.76866, longitude: -82.43563, accuracy: 0 });
    }

    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
        (err) => reject(new Error(err.message || 'Location unavailable')),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  };

  const tagTypeIcon = () => {
    return <Building2 className="w-5 h-5" />;
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60]" onClick={onClose} />

      <div className="fixed inset-0 flex items-center justify-center z-[70] p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="bg-gradient-to-r from-emerald-500 to-teal-600 p-5 text-white">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">Clock In</h2>
                <p className="text-emerald-100 text-sm">
                  {isShopHours ? '🏭 Shop Hours Mode' : 'Choose verification method'}
                </p>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-xl transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-red-700">{error}</p>
              </div>
            )}

            {/* ── STEP: CHOOSE METHOD ── */}
            {step === 'choose' && (
              <div className="space-y-3">
                {/* NFC Option — Primary */}
                <button
                  onClick={startNfcScan}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                    nfcSupported
                      ? 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100 hover:border-emerald-300'
                      : 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed'
                  }`}
                  disabled={!nfcSupported}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${nfcSupported ? 'bg-emerald-500' : 'bg-gray-400'}`}>
                    {nfcSupported ? <Wifi className="w-6 h-6 text-white" /> : <WifiOff className="w-6 h-6 text-white" />}
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-gray-900">Scan NFC Tag</p>
                    <p className="text-xs text-gray-500">
                      {nfcSupported
                        ? 'Tap your phone on the shop NFC tag'
                        : 'NFC not available on this device'}
                    </p>
                  </div>
                </button>

                {/* Remote Option — Out of Town */}
                <button
                  onClick={() => setStep('remote_photo')}
                  className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-amber-200 bg-amber-50 hover:bg-amber-100 hover:border-amber-300 transition-all text-left"
                >
                  <div className="w-12 h-12 rounded-xl bg-amber-500 flex items-center justify-center">
                    <Camera className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-gray-900">Remote Clock-In</p>
                    <p className="text-xs text-gray-500">Out of town? Take a selfie + GPS</p>
                  </div>
                  <span className="px-2 py-0.5 bg-amber-200 text-amber-800 text-[10px] font-bold rounded-full">
                    NEEDS APPROVAL
                  </span>
                </button>

                {/* GPS Fallback — small link */}
                <button
                  onClick={handleGpsClockIn}
                  className="w-full text-center text-xs text-gray-400 hover:text-blue-600 py-2 transition-colors"
                >
                  <MapPin className="w-3 h-3 inline mr-1" />
                  GPS fallback (if NFC isn&apos;t working)
                </button>
              </div>
            )}

            {/* ── STEP: NFC SCANNING ── */}
            {step === 'nfc_scan' && (
              <div className="text-center py-4">
                {nfcScanning && !nfcTag && (
                  <>
                    <div className="relative w-28 h-28 mx-auto mb-4">
                      <div className="absolute inset-0 bg-emerald-400 rounded-full opacity-20 animate-ping" />
                      <div className="absolute inset-3 bg-emerald-400 rounded-full opacity-15 animate-ping" style={{ animationDelay: '0.3s' }} />
                      <div className="relative w-full h-full rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-xl">
                        <Smartphone className="w-12 h-12 text-white" />
                      </div>
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 mb-1">Scanning...</h3>
                    <p className="text-sm text-gray-500 mb-4">Hold your phone near the NFC tag</p>
                    <button
                      onClick={stopNfcScan}
                      className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold text-sm transition-colors"
                    >
                      Cancel
                    </button>
                  </>
                )}

                {nfcTag && (
                  <div className="space-y-3">
                    <div className="w-16 h-16 mx-auto bg-emerald-100 rounded-full flex items-center justify-center">
                      <CheckCircle className="w-8 h-8 text-emerald-600" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">Tag Verified!</h3>
                    <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
                      {tagTypeIcon()}
                      <span className="font-semibold">{nfcTag.label}</span>
                    </div>
                    <p className="text-xs text-gray-500">Clocking you in...</p>
                    <Loader2 className="w-5 h-5 animate-spin text-emerald-600 mx-auto" />
                  </div>
                )}
              </div>
            )}

            {/* ── STEP: REMOTE PHOTO ── */}
            {step === 'remote_photo' && (
              <div className="space-y-4">
                <div className="text-center">
                  <h3 className="font-bold text-gray-900">Remote Clock-In</h3>
                  <p className="text-xs text-gray-500 mt-1">Take a selfie for admin verification</p>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="user"
                  onChange={handlePhotoCapture}
                  className="hidden"
                />

                {photoPreview ? (
                  <div className="relative">
                    <img
                      src={photoPreview}
                      alt="Selfie"
                      className="w-full h-48 object-cover rounded-xl border-2 border-emerald-200"
                    />
                    <button
                      onClick={() => { setPhotoPreview(null); setPhotoFile(null); }}
                      className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full h-48 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center gap-2 hover:border-emerald-400 hover:bg-emerald-50 transition-colors"
                  >
                    <Camera className="w-10 h-10 text-gray-400" />
                    <span className="text-sm text-gray-500 font-semibold">Tap to take selfie</span>
                  </button>
                )}

                <div className="bg-amber-50 rounded-xl p-3 border border-amber-200">
                  <p className="text-xs text-amber-700">
                    <strong>Note:</strong> Remote clock-ins require admin approval. Your GPS location will also be recorded.
                  </p>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setStep('choose')}
                    className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold text-sm"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleRemoteClockIn}
                    disabled={!photoFile}
                    className="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-bold text-sm disabled:opacity-50"
                  >
                    Clock In Remotely
                  </button>
                </div>
              </div>
            )}

            {/* ── STEP: PROCESSING ── */}
            {step === 'processing' && (
              <div className="text-center py-8">
                <Loader2 className="w-10 h-10 animate-spin text-emerald-600 mx-auto mb-3" />
                <p className="text-gray-600 font-semibold">Clocking you in...</p>
                <p className="text-xs text-gray-400 mt-1">Verifying and recording your clock-in</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
