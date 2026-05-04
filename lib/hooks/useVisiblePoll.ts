'use client';

import { useEffect, useRef } from 'react';

/**
 * Polling hook that:
 *   1. Pauses while the tab is hidden (Page Visibility API).
 *   2. Pauses while the browser is offline.
 *   3. Fires once immediately on visible/online resume so users see fresh data.
 *
 * Why this exists: Vercel charges per function invocation. A 30-second poll
 * left running on backgrounded tabs is the single biggest contributor to our
 * function bill — easily 80%+ of polling traffic happens when nobody is
 * looking at the page.
 *
 * Usage:
 *   useVisiblePoll(fetchActiveJobs, { intervalMs: 120_000, runOnMount: true });
 *
 * Conventions:
 *   - Default interval is 120s (2 min). Override only when justified.
 *   - Set `runOnMount: false` if the caller already fetches on mount.
 */
export function useVisiblePoll(
  callback: () => void | Promise<void>,
  options: {
    intervalMs?: number;
    runOnMount?: boolean;
    /** Set to false to disable the hook entirely (e.g. behind a feature flag). */
    enabled?: boolean;
  } = {}
) {
  const { intervalMs = 120_000, runOnMount = false, enabled = true } = options;
  // Stable ref for the callback so consumers don't have to memoize.
  const cbRef = useRef(callback);
  cbRef.current = callback;

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined') return;

    let timer: ReturnType<typeof setInterval> | null = null;

    const isActive = () =>
      (typeof document === 'undefined' || document.visibilityState === 'visible') &&
      (typeof navigator === 'undefined' || navigator.onLine);

    const start = () => {
      if (timer) return;
      timer = setInterval(() => {
        if (isActive()) cbRef.current();
      }, intervalMs);
    };
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    const handleVisibility = () => {
      if (isActive()) {
        // On resume, fetch once immediately so the UI catches up
        cbRef.current();
        start();
      } else {
        stop();
      }
    };

    if (runOnMount && isActive()) cbRef.current();
    if (isActive()) start();

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', handleVisibility);
    window.addEventListener('offline', stop);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', handleVisibility);
      window.removeEventListener('offline', stop);
    };
  }, [intervalMs, enabled, runOnMount]);
}
