'use client';

/**
 * /nfc-clock?tag={uid}
 *
 * iOS NFC URL landing page. When an operator taps a chip that has been written
 * with a URL like:
 *   https://app.pontifexindustries.com/nfc-clock?tag=04:A3:B2:11:C4:2D:80
 *
 * This page:
 * 1. Reads the `tag` query param
 * 2. Verifies it via POST /api/timecard/verify-nfc
 * 3. Checks if user is clocked in → auto clock-in or auto clock-out
 * 4. Shows clear success / error feedback
 *
 * Works on iOS Safari (URL NFC) and Android Chrome (Web NFC API also works).
 */

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { CheckCircle, AlertTriangle, Loader2, Clock, LogOut, LogIn, Wifi } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type PageState =
  | 'loading'       // checking auth + verifying tag
  | 'clocking_in'   // calling clock-in API
  | 'clocking_out'  // calling clock-out API
  | 'success_in'
  | 'success_out'
  | 'error'
  | 'not_logged_in'
  | 'tag_not_found';

function NfcClockContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tagUid = searchParams.get('tag');

  const [state, setState] = useState<PageState>('loading');
  const [message, setMessage] = useState('');
  const [tagLabel, setTagLabel] = useState('');
  const [hoursWorked, setHoursWorked] = useState<number | null>(null);
  const processedRef = useRef(false);

  useEffect(() => {
    if (processedRef.current) return;
    processedRef.current = true;

    if (!tagUid) {
      setState('error');
      setMessage('No NFC tag ID found in URL. Make sure the chip was written correctly.');
      return;
    }

    processNfcTag(tagUid);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagUid]);

  const getLocation = (): Promise<{ latitude: number; longitude: number; accuracy?: number }> => {
    if (process.env.NEXT_PUBLIC_BYPASS_LOCATION_CHECK === 'true') {
      return Promise.resolve({ latitude: 34.76866, longitude: -82.43563, accuracy: 0 });
    }
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        // Provide a fallback so the flow doesn't completely break
        resolve({ latitude: 0, longitude: 0, accuracy: undefined });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
        () => resolve({ latitude: 0, longitude: 0, accuracy: undefined }),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
      );
    });
  };

  const processNfcTag = async (uid: string) => {
    try {
      // 1. Get auth session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setState('not_logged_in');
        return;
      }

      const token = session.access_token;
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      };

      // 2. Verify the NFC tag
      const verifyRes = await fetch('/api/timecard/verify-nfc', {
        method: 'POST',
        headers,
        body: JSON.stringify({ tag_uid: uid, serial_number: uid }),
      });
      const verifyJson = await verifyRes.json();

      if (!verifyRes.ok || !verifyJson.success) {
        if (verifyRes.status === 404) {
          setState('tag_not_found');
          setMessage(verifyJson.error || 'Tag not registered in the system.');
        } else if (verifyRes.status === 403) {
          setState('error');
          setMessage(verifyJson.error || 'This tag is deactivated.');
        } else {
          setState('error');
          setMessage(verifyJson.error || 'Failed to verify NFC tag.');
        }
        return;
      }

      const tag = verifyJson.data;
      setTagLabel(tag.label || uid);

      // 3. Get location (best-effort)
      const location = await getLocation();

      // 4. Check if already clocked in
      const activeRes = await fetch('/api/timecard/current', { headers: { Authorization: `Bearer ${token}` } });
      let isClockedIn = false;
      if (activeRes.ok) {
        const activeJson = await activeRes.json();
        isClockedIn = activeJson.isClockedIn === true;
      }

      if (isClockedIn) {
        // Clock OUT
        setState('clocking_out');

        const outRes = await fetch('/api/timecard/clock-out', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            latitude: location.latitude,
            longitude: location.longitude,
            accuracy: location.accuracy,
            clock_out_method: 'nfc',
            nfc_tag_uid: uid,
            nfc_tag_id: tag.tag_id,
          }),
        });
        const outJson = await outRes.json();

        if (!outRes.ok) {
          setState('error');
          setMessage(outJson.error || 'Failed to clock out.');
          return;
        }

        setHoursWorked(outJson.data?.totalHours ?? null);
        setState('success_out');
        setMessage(outJson.message || 'Clocked out successfully!');
      } else {
        // Clock IN
        setState('clocking_in');

        const inRes = await fetch('/api/timecard/clock-in', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            latitude: location.latitude,
            longitude: location.longitude,
            accuracy: location.accuracy,
            clock_in_method: 'nfc',
            nfc_tag_uid: uid,
            nfc_tag_id: tag.tag_id,
            is_shop_hours: tag.tag_type === 'shop',
          }),
        });
        const inJson = await inRes.json();

        if (!inRes.ok) {
          setState('error');
          setMessage(inJson.error || 'Failed to clock in.');
          return;
        }

        setState('success_in');
        setMessage(inJson.message || 'Clocked in successfully!');
      }
    } catch (err: unknown) {
      console.error('NFC clock page error:', err);
      setState('error');
      setMessage(err instanceof Error ? err.message : 'An unexpected error occurred.');
    }
  };

  // Auto-redirect to dashboard after success
  useEffect(() => {
    if (state === 'success_in' || state === 'success_out') {
      const timer = setTimeout(() => {
        router.push('/dashboard');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [state, router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 p-8 max-w-sm w-full text-center shadow-2xl">

        {/* Loading / Verifying */}
        {(state === 'loading' || state === 'clocking_in' || state === 'clocking_out') && (
          <>
            <div className="relative w-24 h-24 mx-auto mb-5">
              <div className="absolute inset-0 bg-purple-500 rounded-full opacity-20 animate-ping" />
              <div className="relative w-full h-full rounded-full bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center shadow-xl">
                {state === 'clocking_out'
                  ? <LogOut className="w-10 h-10 text-white" />
                  : <Wifi className="w-10 h-10 text-white" />
                }
              </div>
            </div>
            <h1 className="text-xl font-bold text-white mb-2">
              {state === 'loading' && 'Verifying NFC Tag...'}
              {state === 'clocking_in' && 'Clocking In...'}
              {state === 'clocking_out' && 'Clocking Out...'}
            </h1>
            <p className="text-white/50 text-sm">
              {tagLabel ? `Tag: ${tagLabel}` : 'Reading chip...'}
            </p>
            <Loader2 className="w-6 h-6 animate-spin text-purple-400 mx-auto mt-4" />
          </>
        )}

        {/* Success: Clocked In */}
        {state === 'success_in' && (
          <>
            <div className="w-24 h-24 mx-auto mb-5 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-xl">
              <LogIn className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Clocked In!</h1>
            {tagLabel && <p className="text-emerald-300 text-sm font-semibold mb-1">{tagLabel}</p>}
            <p className="text-white/60 text-sm mb-4">{message}</p>
            <div className="flex items-center justify-center gap-1.5 text-xs text-white/30">
              <Clock className="w-3.5 h-3.5" />
              <span>Redirecting to dashboard...</span>
            </div>
          </>
        )}

        {/* Success: Clocked Out */}
        {state === 'success_out' && (
          <>
            <div className="w-24 h-24 mx-auto mb-5 rounded-full bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-xl">
              <LogOut className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Clocked Out!</h1>
            {tagLabel && <p className="text-orange-300 text-sm font-semibold mb-1">{tagLabel}</p>}
            <p className="text-white/60 text-sm mb-1">{message}</p>
            {hoursWorked !== null && (
              <p className="text-2xl font-bold text-orange-300 mb-4">
                {hoursWorked.toFixed(2)} hrs
              </p>
            )}
            <div className="flex items-center justify-center gap-1.5 text-xs text-white/30">
              <Clock className="w-3.5 h-3.5" />
              <span>Redirecting to dashboard...</span>
            </div>
          </>
        )}

        {/* Not logged in */}
        {state === 'not_logged_in' && (
          <>
            <div className="w-24 h-24 mx-auto mb-5 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-xl">
              <AlertTriangle className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-xl font-bold text-white mb-2">Please Log In</h1>
            <p className="text-white/60 text-sm mb-5">You must be logged in to clock in with NFC.</p>
            <button
              onClick={() => router.push(`/login?redirect=${encodeURIComponent(`/nfc-clock?tag=${tagUid}`)}`)}
              className="w-full py-3 bg-gradient-to-r from-purple-500 to-violet-600 hover:from-purple-600 hover:to-violet-700 text-white rounded-xl font-bold text-sm transition-all"
            >
              Log In
            </button>
          </>
        )}

        {/* Tag not found */}
        {state === 'tag_not_found' && (
          <>
            <div className="w-24 h-24 mx-auto mb-5 rounded-full bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center shadow-xl">
              <Wifi className="w-10 h-10 text-white/50" />
            </div>
            <h1 className="text-xl font-bold text-white mb-2">Tag Not Registered</h1>
            <p className="text-white/60 text-sm mb-1">{message}</p>
            <p className="text-white/40 text-xs mb-5 font-mono">{tagUid}</p>
            <p className="text-white/40 text-xs">Contact your supervisor to register this chip.</p>
            <button
              onClick={() => router.push('/dashboard')}
              className="mt-5 w-full py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold text-sm transition-all"
            >
              Go to Dashboard
            </button>
          </>
        )}

        {/* Error */}
        {state === 'error' && (
          <>
            <div className="w-24 h-24 mx-auto mb-5 rounded-full bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shadow-xl">
              <AlertTriangle className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-xl font-bold text-white mb-2">Something Went Wrong</h1>
            <p className="text-white/60 text-sm mb-5">{message}</p>
            <div className="flex gap-3">
              <button
                onClick={() => { setState('loading'); setMessage(''); processNfcTag(tagUid || ''); }}
                className="flex-1 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold text-sm transition-all"
              >
                Retry
              </button>
              <button
                onClick={() => router.push('/dashboard')}
                className="flex-1 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-sm transition-all"
              >
                Dashboard
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function NfcClockPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
      </div>
    }>
      <NfcClockContent />
    </Suspense>
  );
}
