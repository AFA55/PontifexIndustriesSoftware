'use client';

/**
 * The part of the outbox that actually sends. See lib/outbox.ts for the queue
 * itself and for why retrying is safe (the work-items write REPLACES on
 * (job, operator, work_date), so a duplicate send is a no-op).
 *
 * Flushes on mount, whenever the browser reports it is back online, and on a
 * backoff timer. Every send goes through `authedFetch`, so a queued entry that
 * flushes tomorrow gets a fresh token rather than the dead one it was queued
 * with.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { authedFetch, isSessionExpired, isAuthServiceUnavailable } from './authed-fetch';
import {
  readOutbox,
  writeOutbox,
  removeEntry,
  retryable,
  backoffMs,
  type OutboxEntry,
} from './outbox';

export interface OutboxState {
  entries: OutboxEntry[];
  flushing: boolean;
  /** Send everything sendable right now. Safe to call repeatedly. */
  flush: () => Promise<void>;
}

export function useOutbox(): OutboxState {
  const [entries, setEntries] = useState<OutboxEntry[]>([]);
  const [flushing, setFlushing] = useState(false);
  // A ref, not state: two flushes racing would send the same entry twice and
  // could remove an entry the other attempt is still working on.
  const busy = useRef(false);

  useEffect(() => {
    setEntries(readOutbox(window.localStorage));
  }, []);

  const flush = useCallback(async () => {
    if (busy.current) return;
    if (typeof window === 'undefined') return;
    // navigator.onLine is a weak signal (it means "has a network interface",
    // not "can reach the internet"), so it is used only to SKIP obvious
    // no-hopers — never to decide that a send succeeded.
    if (navigator.onLine === false) return;

    const queued = retryable(readOutbox(window.localStorage));
    if (queued.length === 0) return;

    busy.current = true;
    setFlushing(true);
    try {
      for (const item of queued) {
        // Respect the per-entry backoff so a hard-down server is not hammered.
        if (Date.now() - item.queuedAt < backoffMs(item.attempts) * (item.attempts > 0 ? 1 : 0)) {
          continue;
        }
        try {
          const res = await authedFetch(item.url, {
            method: item.method,
            headers: { 'Content-Type': 'application/json' },
            body: item.body,
          });

          if (res.ok) {
            setEntries(removeEntry(window.localStorage, item.id));
            continue;
          }

          // A 4xx that is not auth means the SERVER rejected this content and
          // will reject it again forever — retrying is pointless noise. Mark it
          // stuck so a human sees it, rather than spinning until it expires.
          if (res.status >= 400 && res.status < 500 && res.status !== 401 && res.status !== 408 && res.status !== 429) {
            const body = await res.json().catch(() => null);
            const next = readOutbox(window.localStorage).map((e) =>
              e.id === item.id
                ? { ...e, attempts: 99, lastError: body?.error || `Rejected (${res.status})` }
                : e
            );
            writeOutbox(window.localStorage, next);
            setEntries(next);
            continue;
          }

          // 5xx / 408 / 429 — try again later.
          const next = readOutbox(window.localStorage).map((e) =>
            e.id === item.id ? { ...e, attempts: e.attempts + 1, lastError: `HTTP ${res.status}` } : e
          );
          writeOutbox(window.localStorage, next);
          setEntries(next);
        } catch (e) {
          // Session gone or the sign-in service is down: keep the entry, count
          // the attempt, stop the loop. Grinding through the rest would just
          // pile more failures onto the same cause.
          const why = isSessionExpired(e)
            ? 'Waiting for you to sign in again'
            : isAuthServiceUnavailable(e)
              ? 'Sign-in service unreachable'
              : 'No connection';
          const next = readOutbox(window.localStorage).map((x) =>
            x.id === item.id ? { ...x, attempts: x.attempts + 1, lastError: why } : x
          );
          writeOutbox(window.localStorage, next);
          setEntries(next);
          break;
        }
      }
    } finally {
      busy.current = false;
      setFlushing(false);
    }
  }, []);

  useEffect(() => {
    void flush();
    const onOnline = () => { void flush(); };
    window.addEventListener('online', onOnline);
    // A timer as well as the event: `online` does not fire when the phone had
    // an interface the whole time but the far end was unreachable, which is
    // most of what happens in a basement or a lift shaft.
    const timer = setInterval(() => { void flush(); }, 30_000);
    return () => {
      window.removeEventListener('online', onOnline);
      clearInterval(timer);
    };
  }, [flush]);

  return { entries, flushing, flush };
}
