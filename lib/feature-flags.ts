// lib/feature-flags.ts
// Client-side hook to read current user's feature flags

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface UserFeatureFlags {
  can_create_schedule_forms: boolean;
  can_view_schedule_board: boolean;
  can_edit_schedule_board: boolean;
  can_request_schedule_changes: boolean;
  can_view_active_jobs: boolean;
  can_view_all_jobs: boolean;
  can_view_completed_jobs: boolean;
  can_view_timecards: boolean;
  can_view_customers: boolean;
  can_view_invoicing: boolean;
  can_view_analytics: boolean;
  can_view_facilities: boolean;
  can_view_nfc_tags: boolean;
  can_view_form_builder: boolean;
  can_manage_team: boolean;
  can_manage_settings: boolean;
  can_grant_super_admin: boolean;
  can_view_personal_hours: boolean;
  can_view_personal_metrics: boolean;
  admin_type: string;
}

export const DEFAULT_FLAGS: UserFeatureFlags = {
  can_create_schedule_forms: false,
  can_view_schedule_board: false,
  can_edit_schedule_board: false,
  can_request_schedule_changes: true,
  can_view_active_jobs: false,
  can_view_all_jobs: false,
  can_view_completed_jobs: false,
  can_view_timecards: false,
  can_view_customers: false,
  can_view_invoicing: false,
  can_view_analytics: false,
  can_view_facilities: false,
  can_view_nfc_tags: false,
  can_view_form_builder: false,
  can_manage_team: false,
  can_manage_settings: false,
  can_grant_super_admin: false,
  can_view_personal_hours: true,
  can_view_personal_metrics: true,
  admin_type: 'admin',
};

// Super admins and ops managers bypass all flags — they get everything
export const SUPER_ADMIN_FLAGS: UserFeatureFlags = Object.fromEntries(
  Object.keys(DEFAULT_FLAGS).map((k) => [k, k === 'admin_type' ? 'super_admin' : true])
) as unknown as UserFeatureFlags;

export function useFeatureFlags(
  userId: string | null,
  role: string | null
): {
  flags: UserFeatureFlags;
  loading: boolean;
} {
  const [flags, setFlags] = useState<UserFeatureFlags>(DEFAULT_FLAGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // While userId is still being resolved by the caller, keep `loading: true`
    // so page guards don't briefly see loading=false + DEFAULT_FLAGS (all-false)
    // and wrongly redirect before flags arrive.
    if (!userId) return;

    setLoading(true); // reset before every fetch so guards wait for fresh data

    // Super admins get all permissions — no DB lookup needed
    if (role === 'super_admin' || role === 'operations_manager') {
      setFlags(SUPER_ADMIN_FLAGS);
      setLoading(false);
      return;
    }

    let cancelled = false;
    let loaded = false;

    const fetchFlags = async (token: string): Promise<boolean> => {
      try {
        const res = await fetch(`/api/admin/user-flags/${userId}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (!res.ok) return false;
        const json = await res.json();
        if (!cancelled && json?.data) {
          setFlags({ ...DEFAULT_FLAGS, ...json.data });
        }
        return true;
      } catch {
        return false;
      }
    };

    // Subscribe first so we catch SIGNED_IN / TOKEN_REFRESHED that fire between
    // getSession() returning null and the token becoming available.
    const { data: authSub } = supabase.auth.onAuthStateChange(async (_evt, newSession) => {
      if (loaded || cancelled) return;
      if (newSession?.access_token) {
        const ok = await fetchFlags(newSession.access_token);
        if (ok && !cancelled) { loaded = true; setLoading(false); }
      }
    });

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (cancelled) return;
      if (session?.access_token) {
        let ok = await fetchFlags(session.access_token);
        if (!ok && !cancelled) {
          // Stale token — refresh and retry once before giving up.
          const { data: refreshed } = await supabase.auth.refreshSession();
          if (refreshed?.session?.access_token && !cancelled) {
            ok = await fetchFlags(refreshed.session.access_token);
          }
        }
        if (ok && !cancelled) { loaded = true; setLoading(false); return; }
      }
      // Safety: stop the loader eventually even if no token arrives.
      // onAuthStateChange may still fire later and populate flags.
      setTimeout(() => { if (!cancelled && !loaded) setLoading(false); }, 3000);
    });

    return () => {
      cancelled = true;
      authSub.subscription.unsubscribe();
    };
  }, [userId, role]);

  return { flags, loading };
}
