// lib/feature-flags.ts
// Client-side hook to read current user's feature flags

import { useEffect, useState } from 'react';

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
    if (!userId) {
      setLoading(false);
      return;
    }

    // Super admins get all permissions — no DB lookup needed
    if (role === 'super_admin' || role === 'operations_manager') {
      setFlags(SUPER_ADMIN_FLAGS);
      setLoading(false);
      return;
    }

    fetch(`/api/admin/user-flags/${userId}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.data) setFlags({ ...DEFAULT_FLAGS, ...json.data });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId, role]);

  return { flags, loading };
}
