'use client';

/**
 * Background-location consent state (Phase C / compliance).
 *
 * Apple + Google require an in-app "prominent disclosure" with an explicit
 * Agree / decline choice that appears BEFORE the OS permission prompt, and a
 * decline must NOT trigger the OS prompt. This module is the client-side record
 * of that choice. Background geofencing must never start until this returns
 * 'granted'. Keyed per-user so a shared device can't leak one worker's choice.
 */

export type BgLocationConsent = 'granted' | 'declined' | null;

const KEY = 'pontifex.bgLocationConsent';

function scopedKey(userId: string | null): string {
  return userId ? `${KEY}:${userId}` : KEY;
}

export function getBgLocationConsent(userId: string | null): BgLocationConsent {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem(scopedKey(userId));
    return v === 'granted' || v === 'declined' ? v : null;
  } catch {
    return null;
  }
}

export function setBgLocationConsent(userId: string | null, value: 'granted' | 'declined'): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(scopedKey(userId), value);
  } catch {
    /* ignore */
  }
}
