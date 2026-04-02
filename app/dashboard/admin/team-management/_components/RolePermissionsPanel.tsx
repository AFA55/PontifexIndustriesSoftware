'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  RotateCcw,
  Save,
  ChevronDown,
  CheckCircle2,
  Lock,
  Eye,
  Send,
  Zap,
  AlertCircle,
  Info,
} from 'lucide-react';
import {
  ADMIN_CARDS,
  ROLE_PERMISSION_PRESETS,
  BYPASS_ROLES,
  ALL_CARD_KEYS,
  getRoleLabel,
  type PermissionLevel,
} from '@/lib/rbac';

// ============================================================
// Constants
// ============================================================

const CONFIGURABLE_ROLES = [
  { value: 'admin', label: 'Admin', description: 'Customizable admin dashboard access' },
  { value: 'supervisor', label: 'Supervisor', description: 'Submit forms, add notes, view schedules' },
  { value: 'salesman', label: 'Sales', description: 'Schedule forms and board access' },
];

const CARD_GROUPS: { label: string; keys: string[] }[] = [
  {
    label: 'Operations',
    keys: ['schedule_board', 'schedule_form', 'completed_jobs'],
  },
  {
    label: 'Management',
    keys: ['timecards', 'team_management', 'customer_profiles', 'billing', 'operator_profiles', 'analytics'],
  },
  {
    label: 'Admin & Tools',
    keys: ['operations_hub', 'tenant_management', 'system_health', 'settings'],
  },
];

const LEVEL_CONFIG: Record<PermissionLevel, { label: string; icon: typeof Lock; color: string; bgColor: string; borderColor: string }> = {
  none: { label: 'No Access', icon: Lock, color: 'text-gray-400', bgColor: 'bg-gray-50', borderColor: 'border-gray-200' },
  view: { label: 'View', icon: Eye, color: 'text-blue-500', bgColor: 'bg-blue-50', borderColor: 'border-blue-200' },
  submit: { label: 'Submit', icon: Send, color: 'text-amber-500', bgColor: 'bg-amber-50', borderColor: 'border-amber-200' },
  full: { label: 'Full', icon: Zap, color: 'text-emerald-500', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-200' },
};

const PERMISSION_CYCLE: PermissionLevel[] = ['none', 'view', 'submit', 'full'];

// ============================================================
// Props
// ============================================================

interface RolePermissionsPanelProps {
  /** JWT auth headers provider */
  getAuthHeaders: () => Promise<Record<string, string>>;
  /** Role of the admin using this panel */
  editorRole: string;
}

// ============================================================
// Component
// ============================================================

export default function RolePermissionsPanel({ getAuthHeaders, editorRole }: RolePermissionsPanelProps) {
  const canEdit = BYPASS_ROLES.includes(editorRole);

  const [selectedRole, setSelectedRole] = useState<string>('admin');
  const [permissions, setPermissions] = useState<Record<string, PermissionLevel>>({});
  const [isDefault, setIsDefault] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  // ── Load permissions for selected role ──────────────────────
  const loadPermissions = useCallback(async (role: string) => {
    setLoading(true);
    setSaveStatus('idle');
    setErrorMsg('');
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/role-permissions?role=${role}`, { headers });
      const json = await res.json();
      if (res.ok && json.data) {
        setPermissions(json.data);
        setIsDefault(json.isDefault ?? true);
      } else {
        setErrorMsg(json.error || 'Failed to load permissions');
      }
    } catch {
      setErrorMsg('Network error loading permissions');
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    loadPermissions(selectedRole);
  }, [selectedRole, loadPermissions]);

  // ── Toggle a single card's permission level ──────────────────
  const cyclePermission = (cardKey: string) => {
    if (!canEdit) return;
    const current = permissions[cardKey] ?? 'none';
    const idx = PERMISSION_CYCLE.indexOf(current);
    const next = PERMISSION_CYCLE[(idx + 1) % PERMISSION_CYCLE.length];
    setPermissions(prev => ({ ...prev, [cardKey]: next }));
    setSaveStatus('idle');
  };

  const setPermissionLevel = (cardKey: string, level: PermissionLevel) => {
    if (!canEdit) return;
    setPermissions(prev => ({ ...prev, [cardKey]: level }));
    setSaveStatus('idle');
  };

  // ── Bulk set all cards in a group ────────────────────────────
  const setGroupLevel = (keys: string[], level: PermissionLevel) => {
    if (!canEdit) return;
    setPermissions(prev => {
      const next = { ...prev };
      keys.forEach(k => { next[k] = level; });
      return next;
    });
    setSaveStatus('idle');
  };

  // ── Save to API ──────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    setSaveStatus('idle');
    setErrorMsg('');
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/role-permissions', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ role: selectedRole, card_permissions: permissions }),
      });
      const json = await res.json();
      if (res.ok) {
        setSaveStatus('success');
        setIsDefault(false);
        setTimeout(() => setSaveStatus('idle'), 3000);
      } else {
        setSaveStatus('error');
        setErrorMsg(json.error || 'Failed to save');
      }
    } catch {
      setSaveStatus('error');
      setErrorMsg('Network error saving permissions');
    } finally {
      setSaving(false);
    }
  };

  // ── Reset to defaults ────────────────────────────────────────
  const handleReset = async () => {
    if (!window.confirm(`Reset ${getRoleLabel(selectedRole)} permissions to system defaults? This will discard any customizations.`)) return;
    setResetting(true);
    setSaveStatus('idle');
    setErrorMsg('');
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/role-permissions?role=${selectedRole}`, {
        method: 'DELETE',
        headers,
      });
      if (res.ok) {
        // Reload defaults
        await loadPermissions(selectedRole);
        setSaveStatus('success');
        setTimeout(() => setSaveStatus('idle'), 3000);
      } else {
        const json = await res.json();
        setErrorMsg(json.error || 'Reset failed');
        setSaveStatus('error');
      }
    } catch {
      setErrorMsg('Network error resetting permissions');
      setSaveStatus('error');
    } finally {
      setResetting(false);
    }
  };

  // ── Render helpers ───────────────────────────────────────────

  const renderPermissionButton = (cardKey: string) => {
    const level = permissions[cardKey] ?? 'none';
    const cfg = LEVEL_CONFIG[level];
    const Icon = cfg.icon;

    if (!canEdit) {
      // Read-only badge
      return (
        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-xs font-semibold ${cfg.bgColor} ${cfg.borderColor} ${cfg.color}`}>
          <Icon className="w-3 h-3" />
          {cfg.label}
        </span>
      );
    }

    return (
      <div className="relative group">
        <button
          onClick={() => cyclePermission(cardKey)}
          className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all hover:shadow-sm active:scale-95 ${cfg.bgColor} ${cfg.borderColor} ${cfg.color}`}
          title="Click to cycle through permission levels"
        >
          <Icon className="w-3 h-3" />
          {cfg.label}
          <ChevronDown className="w-2.5 h-2.5 opacity-50" />
        </button>

        {/* Dropdown for direct selection */}
        <div className="absolute right-0 top-full mt-1 w-32 bg-white border border-gray-200 rounded-lg shadow-lg z-20 hidden group-focus-within:block opacity-0 group-hover:opacity-100 group-hover:block transition-opacity">
          {PERMISSION_CYCLE.map(lvl => {
            const lc = LEVEL_CONFIG[lvl];
            const LIcon = lc.icon;
            return (
              <button
                key={lvl}
                onClick={(e) => { e.stopPropagation(); setPermissionLevel(cardKey, lvl); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold transition-colors first:rounded-t-lg last:rounded-b-lg ${
                  level === lvl ? `${lc.bgColor} ${lc.color}` : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <LIcon className="w-3 h-3" />
                {lc.label}
                {level === lvl && <CheckCircle2 className="w-3 h-3 ml-auto" />}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  // ── Summary counts ───────────────────────────────────────────
  const counts = PERMISSION_CYCLE.reduce((acc, lvl) => {
    acc[lvl] = ALL_CARD_KEYS.filter(k => (permissions[k] ?? 'none') === lvl).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-5">

      {/* Header with role selector and info */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-purple-50 rounded-lg flex items-center justify-center flex-shrink-0">
              <Shield className="w-4 h-4 text-purple-600" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-gray-900">Role Permissions</h2>
              <p className="text-xs text-gray-500">Control what each role can see and do in the admin dashboard</p>
            </div>
          </div>

          {!canEdit && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 font-medium flex-shrink-0">
              <Info className="w-3 h-3" />
              View only
            </div>
          )}
        </div>

        {/* Role tabs */}
        <div className="flex flex-wrap gap-2">
          {CONFIGURABLE_ROLES.map(r => (
            <button
              key={r.value}
              onClick={() => setSelectedRole(r.value)}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all border ${
                selectedRole === r.value
                  ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300 hover:text-purple-600'
              }`}
            >
              {r.label}
              {!isDefault && selectedRole === r.value && (
                <span className="ml-1.5 px-1 py-0.5 bg-white/20 rounded text-[9px] font-bold uppercase tracking-wide">
                  Custom
                </span>
              )}
            </button>
          ))}

          <div className="ml-auto flex items-center gap-1.5 text-xs text-gray-400">
            <span className="hidden sm:inline">super_admin &amp; ops_manager always have full access</span>
          </div>
        </div>

        {/* Bypass role note */}
        <div className="mt-3 flex items-center gap-2 p-2.5 bg-indigo-50 border border-indigo-100 rounded-lg">
          <Zap className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
          <p className="text-xs text-indigo-700">
            <span className="font-semibold">Super Admin</span> and <span className="font-semibold">Operations Manager</span> bypass all permission checks and always have full access to every feature.
          </p>
        </div>
      </div>

      {/* Status / error banner */}
      {saveStatus === 'success' && (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 font-medium">
          <CheckCircle2 className="w-4 h-4" />
          Permissions saved successfully. Changes take effect immediately for all users with this role.
        </div>
      )}
      {saveStatus === 'error' && errorMsg && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 font-medium">
          <AlertCircle className="w-4 h-4" />
          {errorMsg}
        </div>
      )}

      {/* Permission grid */}
      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
          <div className="animate-spin w-7 h-7 border-2 border-purple-600 border-t-transparent rounded-full mx-auto mb-3"></div>
          <p className="text-gray-500 text-sm">Loading permissions...</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Summary bar */}
          <div className="flex flex-wrap gap-2">
            {PERMISSION_CYCLE.map(lvl => {
              const lc = LEVEL_CONFIG[lvl];
              const LIcon = lc.icon;
              return (
                <div key={lvl} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold ${lc.bgColor} ${lc.borderColor} ${lc.color}`}>
                  <LIcon className="w-3 h-3" />
                  {lc.label}: {counts[lvl]}
                </div>
              );
            })}
            {!isDefault && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-purple-200 bg-purple-50 text-xs font-semibold text-purple-700 ml-auto">
                <Shield className="w-3 h-3" />
                Custom permissions active
              </div>
            )}
          </div>

          {/* Card groups */}
          {CARD_GROUPS.map(group => {
            const groupCards = ADMIN_CARDS.filter(c => group.keys.includes(c.key));
            if (groupCards.length === 0) return null;
            return (
              <div key={group.label} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-4 sm:px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">{group.label}</h3>
                  {canEdit && (
                    <div className="flex gap-1">
                      {(['none', 'view', 'full'] as PermissionLevel[]).map(lvl => {
                        const lc = LEVEL_CONFIG[lvl];
                        return (
                          <button
                            key={lvl}
                            onClick={() => setGroupLevel(group.keys, lvl)}
                            className={`px-2 py-1 rounded text-[10px] font-semibold transition-all border ${lc.bgColor} ${lc.borderColor} ${lc.color} hover:shadow-sm`}
                            title={`Set all in this group to ${lc.label}`}
                          >
                            All {lc.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="divide-y divide-gray-50">
                  {groupCards.map(card => {
                    const level = permissions[card.key] ?? 'none';
                    const lc = LEVEL_CONFIG[level];
                    return (
                      <div key={card.key} className={`px-4 sm:px-5 py-3 flex items-center justify-between gap-4 transition-colors ${level !== 'none' ? 'bg-white' : 'bg-gray-50/50'}`}>
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span className="text-lg flex-shrink-0" aria-hidden="true">{card.icon}</span>
                          <div className="min-w-0">
                            <p className={`text-sm font-semibold truncate ${level === 'none' ? 'text-gray-400' : 'text-gray-800'}`}>{card.title}</p>
                            <p className="text-xs text-gray-400 truncate hidden sm:block">{card.description}</p>
                          </div>
                        </div>
                        <div className="flex-shrink-0">
                          {renderPermissionButton(card.key)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Save / Reset actions */}
          {canEdit && (
            <div className="flex items-center justify-between gap-3 pt-1">
              <button
                onClick={handleReset}
                disabled={resetting || saving || isDefault}
                className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50 hover:border-gray-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <RotateCcw className={`w-4 h-4 ${resetting ? 'animate-spin' : ''}`} />
                {resetting ? 'Resetting...' : 'Reset to Defaults'}
              </button>

              <button
                onClick={handleSave}
                disabled={saving || resetting}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-lg text-sm font-semibold transition-all shadow-sm hover:shadow disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className={`w-4 h-4 ${saving ? 'animate-pulse' : ''}`} />
                {saving ? 'Saving...' : 'Save Permissions'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
