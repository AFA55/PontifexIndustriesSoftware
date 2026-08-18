'use client';

/**
 * The client half: load the SIGNED-IN user's per-user card permissions so pages
 * stop passing `null` to `getCardPermission` and silently ignoring every grant.
 *
 * Same endpoint the dashboard customiser already uses
 * (`/api/card-permissions/me`, batched there alongside the layout preferences),
 * so there is one server route producing this map, not two.
 *
 * `loading` matters: until the fetch lands, `permissions` is null and
 * `getCardPermission` answers from the role preset alone. That is the right
 * DEFAULT (a grant appears a moment late) but the wrong basis for a REDIRECT —
 * a page guard that runs early would bounce a user whose override was the only
 * thing letting them in. Wait for `loading === false` before redirecting.
 *
 * `error` matters just as much. Falling back to the preset on a failed fetch is
 * the safe DIRECTION, but done silently it is the platform's signature defect
 * again: one network blip and every payroll control disappears from a page that
 * otherwise looks completely normal, with nothing on screen to explain it.
 * Consumers must surface `error` — see the banner on the timecards pages.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { PermissionLevel } from '@/lib/rbac';

export interface MyCardPermissions {
  /** null = not loaded, or this user has no overrides → role preset applies. */
  permissions: Record<string, PermissionLevel> | null;
  /** Role as the SERVER sees it (profiles.role), not the cached client copy. */
  role: string | null;
  loading: boolean;
  /**
   * True when the overrides could NOT be read — distinct from "there are none".
   * The user is on their role preset either way, but only this case means what
   * they see may be wrong.
   */
  error: boolean;
  /** Manual retry, for a "Try again" affordance next to the banner. */
  reload: () => void;
}

/** One retry, ~600ms later. A blip should not cost Amanda her payroll buttons. */
const RETRY_DELAY_MS = 600;

export function useMyCardPermissions(): MyCardPermissions {
  const [permissions, setPermissions] = useState<Record<string, PermissionLevel> | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;

    const fetchOnce = async (): Promise<boolean> => {
      const { data: { session } } = await supabase.auth.getSession();
      // No session is not a permissions failure — the auth guard handles it.
      // Reporting it as one would put an alarming banner on the login bounce.
      if (!session) return true;

      const res = await fetch('/api/card-permissions/me', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (cancelled) return true;
      if (!res.ok) return false;

      const json = await res.json();
      if (cancelled) return true;
      if (json.role) setRole(json.role);
      // An empty map means "no overrides" — keep it null so
      // getCardPermission's `cardKey in userPermissions` check falls straight
      // through to the role preset.
      const map = json.permissions as Record<string, PermissionLevel> | undefined;
      setPermissions(map && Object.keys(map).length > 0 ? map : null);
      return true;
    };

    (async () => {
      setLoading(true);
      setError(false);
      let ok = false;
      try {
        ok = await fetchOnce();
      } catch {
        ok = false;
      }

      if (!ok && !cancelled) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        if (!cancelled) {
          try {
            ok = await fetchOnce();
          } catch {
            ok = false;
          }
        }
      }

      if (cancelled) return;
      // Fall back to the role preset — the same access the user had before this
      // hook existed. Never a blank screen; but `error` says so out loud.
      setError(!ok);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [attempt]);

  return { permissions, role, loading, error, reload };
}
