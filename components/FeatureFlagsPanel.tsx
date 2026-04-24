'use client';
import { useState } from 'react';
import { Save, Loader2 } from 'lucide-react';
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

const FLAG_GROUPS = [
  {
    label: 'Schedule & Jobs',
    icon: '📅',
    flags: [
      { key: 'can_create_schedule_forms', label: 'Create Schedule Forms', desc: 'Submit new job requests (requires super admin approval)' },
      { key: 'can_view_schedule_board', label: 'View Schedule Board', desc: 'Read-only access to the schedule board' },
      { key: 'can_edit_schedule_board', label: 'Edit Schedule Board', desc: 'Directly edit/reschedule jobs (super admin level)' },
      { key: 'can_request_schedule_changes', label: 'Request Schedule Changes', desc: 'Submit change requests on existing jobs' },
    ],
  },
  {
    label: 'Job Visibility',
    icon: '👁️',
    flags: [
      { key: 'can_view_active_jobs', label: 'Active Jobs Tab', desc: 'View the Active Jobs dashboard section' },
      { key: 'can_view_all_jobs', label: 'View All Jobs', desc: 'See all company jobs (vs. only jobs assigned to them)' },
      { key: 'can_view_completed_jobs', label: 'Completed Jobs', desc: 'Access the Completed Jobs section' },
    ],
  },
  {
    label: 'People & Finance',
    icon: '💼',
    flags: [
      { key: 'can_view_timecards', label: 'Timecards', desc: 'View timecard and payroll section' },
      { key: 'can_view_customers', label: 'Customers', desc: 'Access customer management' },
      { key: 'can_view_invoicing', label: 'Invoicing', desc: 'View and manage invoices' },
      { key: 'can_view_analytics', label: 'Analytics', desc: 'View analytics dashboard' },
    ],
  },
  {
    label: 'Tools',
    icon: '🛠️',
    flags: [
      { key: 'can_view_facilities', label: 'Facilities', desc: 'Manage facilities and badges' },
      { key: 'can_view_nfc_tags', label: 'NFC Tags', desc: 'Manage NFC tag assignments' },
      { key: 'can_view_form_builder', label: 'Form Builder', desc: 'Create and edit customer forms' },
    ],
  },
  {
    label: 'Administration',
    icon: '⚙️',
    flags: [
      { key: 'can_manage_team', label: 'Manage Team', desc: 'View and edit team profiles' },
      { key: 'can_manage_settings', label: 'Settings', desc: 'Access platform settings' },
      // 'can_grant_super_admin' — hidden until wired (no UI consumer reads it yet)
    ],
  },
  // 'Personal Metrics' group hidden until wired — 'can_view_personal_hours'
  // and 'can_view_personal_metrics' currently have no UI consumers.
];

const ADMIN_TYPE_PRESETS: Record<string, Partial<UserFeatureFlags>> = {
  sales_admin: {
    // Sales people see only their own assigned jobs by default (can_view_all_jobs: false)
    can_create_schedule_forms: true, can_view_schedule_board: true, can_request_schedule_changes: true,
    can_view_active_jobs: true, can_view_all_jobs: false, can_view_completed_jobs: true,
    can_view_customers: true, can_view_personal_metrics: true, can_view_personal_hours: true,
  },
  operations_admin: {
    can_create_schedule_forms: true, can_view_schedule_board: true, can_edit_schedule_board: true,
    can_request_schedule_changes: true, can_view_active_jobs: true, can_view_all_jobs: true,
    can_view_completed_jobs: true, can_view_timecards: true, can_view_customers: true,
    can_view_facilities: true, can_manage_team: true, can_view_personal_metrics: true, can_view_personal_hours: true,
  },
  admin: {
    can_create_schedule_forms: true, can_view_schedule_board: true, can_edit_schedule_board: true,
    can_request_schedule_changes: true, can_view_active_jobs: true, can_view_all_jobs: true,
    can_view_completed_jobs: true, can_view_timecards: true, can_view_customers: true,
    can_view_invoicing: true, can_view_analytics: true, can_view_facilities: true,
    can_view_nfc_tags: true, can_view_form_builder: true, can_manage_team: true,
    can_manage_settings: true, can_view_personal_metrics: true, can_view_personal_hours: true,
  },
  operator: {
    // Can work their jobs, clock in/out, view their timecard, submit work, complete jobs
    // Cannot access admin panel, schedule board, customers, invoicing, analytics, team management
    can_request_schedule_changes: false, can_view_active_jobs: true, can_view_all_jobs: false,
    can_view_timecards: true, can_view_personal_hours: true, can_view_personal_metrics: true,
  },
  team_member: {
    // Most restricted — only my-jobs and timecard
    can_view_active_jobs: true, can_view_all_jobs: false,
    can_view_personal_hours: true, can_view_personal_metrics: false,
  },
};

const DEFAULT_OFF: UserFeatureFlags = {
  can_create_schedule_forms: false, can_view_schedule_board: false, can_edit_schedule_board: false,
  can_request_schedule_changes: true, can_view_active_jobs: false, can_view_all_jobs: false,
  can_view_completed_jobs: false, can_view_timecards: false, can_view_customers: false,
  can_view_invoicing: false, can_view_analytics: false, can_view_facilities: false,
  can_view_nfc_tags: false, can_view_form_builder: false, can_manage_team: false,
  can_manage_settings: false, can_grant_super_admin: false, can_view_personal_hours: true,
  can_view_personal_metrics: true, admin_type: 'admin',
};

interface Props {
  userId: string;
  initialFlags?: Partial<UserFeatureFlags>;
  onSave?: (flags: UserFeatureFlags) => void;
  readOnly?: boolean;
}

export default function FeatureFlagsPanel({ userId, initialFlags, onSave, readOnly = false }: Props) {
  const [flags, setFlags] = useState<UserFeatureFlags>({ ...DEFAULT_OFF, ...initialFlags });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const applyPreset = (presetKey: string) => {
    const preset = ADMIN_TYPE_PRESETS[presetKey] || {};
    setFlags({ ...DEFAULT_OFF, ...preset, admin_type: presetKey });
  };

  const toggle = (key: keyof UserFeatureFlags) => {
    if (readOnly) return;
    setFlags(f => ({ ...f, [key]: !f[key] }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(`/api/admin/user-flags/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(flags),
      });
      const json = await res.json();
      if (json.success) {
        setSaved(true);
        onSave?.(flags);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Admin Type / Preset selector */}
      {!readOnly && (
        <div>
          <label className="text-sm text-gray-400 mb-3 block font-medium">Quick Preset</label>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
            {[
              { key: 'sales_admin', label: 'Sales Admin', desc: 'Schedule + assigned jobs + customers' },
              { key: 'operations_admin', label: 'Operations Admin', desc: 'Full ops access + team management' },
              { key: 'admin', label: 'Admin', desc: 'Full admin access across all modules' },
              { key: 'operator', label: 'Operator', desc: 'Own jobs, clock in/out, timecard, work submission' },
              { key: 'team_member', label: 'Team Member', desc: 'My jobs and timecard only' },
            ].map(preset => (
              <button key={preset.key} onClick={() => applyPreset(preset.key)}
                className={`p-3 rounded-xl border text-left transition-all ${
                  flags.admin_type === preset.key
                    ? 'border-purple-500 bg-purple-500/10'
                    : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                }`}>
                <div className="text-sm font-medium text-white">{preset.label}</div>
                <div className="text-xs text-gray-400 mt-0.5">{preset.desc}</div>
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2">Selecting a preset fills in the toggles below — you can still customize after.</p>
        </div>
      )}

      {/* Feature toggle groups */}
      {FLAG_GROUPS.map(group => (
        <div key={group.label} className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">
            {group.label}
          </h3>
          <div className="space-y-3">
            {group.flags.map(flag => (
              <div key={flag.key} className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="text-sm text-white font-medium">{flag.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{flag.desc}</div>
                </div>
                <button
                  onClick={() => toggle(flag.key as keyof UserFeatureFlags)}
                  disabled={readOnly}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
                    flags[flag.key as keyof UserFeatureFlags]
                      ? 'bg-purple-600'
                      : 'bg-gray-600'
                  } ${readOnly ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    flags[flag.key as keyof UserFeatureFlags] ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>
            ))}
          </div>
          {group.label === 'Job Visibility' && (
            <p className="text-xs text-gray-500 mt-3 pt-3 border-t border-gray-700/50">
              {flags.can_view_all_jobs
                ? 'This user can view all company jobs.'
                : 'This user can only view jobs assigned to them.'}
            </p>
          )}
        </div>
      ))}

      {!readOnly && (
        <button onClick={handleSave} disabled={saving}
          className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl py-3 font-semibold transition-colors flex items-center justify-center gap-2">
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : saved ? 'Saved!' : <><Save className="w-4 h-4" /> Save Permissions</>}
        </button>
      )}
    </div>
  );
}
