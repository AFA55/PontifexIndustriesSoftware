'use client';

import { useState, useEffect } from 'react';
import {
  ADMIN_CARDS,
  ROLES_WITH_LABELS,
  ROLE_PERMISSION_PRESETS,
  BYPASS_ROLES,
  ALL_CARD_KEYS,
  getDefaultPermissions,
  getRoleLabel,
  type PermissionLevel,
} from '@/lib/rbac';

// ============================================================
// Types
// ============================================================

interface PermissionEditorModalProps {
  /** The user being edited (name shown in header) */
  userName: string;
  /** The user's email */
  userEmail: string;
  /** Current (or default) role */
  initialRole: string;
  /** Current per-user permissions (if any) */
  initialPermissions?: Record<string, PermissionLevel>;
  /** Role of the admin performing the edit */
  editorRole: string;
  /** Called when the admin confirms the changes */
  onSave: (role: string, permissions: Record<string, PermissionLevel>) => void;
  /** Called when the admin cancels */
  onCancel: () => void;
  /** Whether the save is in progress */
  saving?: boolean;
  /** Optional title override */
  title?: string;
}

// ============================================================
// Component
// ============================================================

export default function PermissionEditorModal({
  userName,
  userEmail,
  initialRole,
  initialPermissions,
  editorRole,
  onSave,
  onCancel,
  saving = false,
  title = 'Set Role & Permissions',
}: PermissionEditorModalProps) {
  const [selectedRole, setSelectedRole] = useState(initialRole || 'operator');
  const [permissions, setPermissions] = useState<Record<string, PermissionLevel>>(() => {
    // Start with role preset, then overlay any existing per-user permissions
    const preset = getDefaultPermissions(initialRole || 'operator');
    if (initialPermissions) {
      for (const key of ALL_CARD_KEYS) {
        if (key in initialPermissions) {
          preset[key] = initialPermissions[key];
        }
      }
    }
    return preset;
  });

  // Whether the selected role bypasses all permission checks
  const isBypassRole = BYPASS_ROLES.includes(selectedRole);

  // Whether the current editor can grant super_admin
  const canGrantSuperAdmin = editorRole === 'super_admin';

  // Group roles by tier
  const workerRoles = ROLES_WITH_LABELS.filter(r => r.tier === 'worker');
  const officeRoles = ROLES_WITH_LABELS.filter(r => r.tier === 'office');
  const managementRoles = ROLES_WITH_LABELS.filter(r => r.tier === 'management');

  // When role changes, reset permissions to that role's preset
  const handleRoleChange = (newRole: string) => {
    setSelectedRole(newRole);
    setPermissions(getDefaultPermissions(newRole));
  };

  // Toggle a specific card's permission level
  const handlePermissionChange = (cardKey: string, level: PermissionLevel) => {
    setPermissions(prev => ({ ...prev, [cardKey]: level }));
  };

  // Count permission summary
  const fullCount = Object.values(permissions).filter(v => v === 'full').length;
  const viewCount = Object.values(permissions).filter(v => v === 'view').length;
  const noneCount = Object.values(permissions).filter(v => v === 'none').length;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-2xl font-bold text-gray-800">{title}</h3>
          <p className="text-gray-500 mt-1">
            <span className="font-semibold text-gray-700">{userName}</span>{' '}
            <span className="text-sm">({userEmail})</span>
          </p>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Role Selection */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wider">
              Select Role
            </label>

            {/* Worker tier */}
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Field Roles</p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {workerRoles.map(role => (
                <button
                  key={role.value}
                  onClick={() => handleRoleChange(role.value)}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${
                    selectedRole === role.value
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <p className={`font-semibold text-sm ${selectedRole === role.value ? 'text-blue-700' : 'text-gray-800'}`}>
                    {role.label}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{role.description}</p>
                </button>
              ))}
            </div>

            {/* Office tier */}
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Office Roles</p>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {officeRoles.map(role => (
                <button
                  key={role.value}
                  onClick={() => handleRoleChange(role.value)}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${
                    selectedRole === role.value
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <p className={`font-semibold text-sm ${selectedRole === role.value ? 'text-blue-700' : 'text-gray-800'}`}>
                    {role.label}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{role.description}</p>
                </button>
              ))}
            </div>

            {/* Management tier */}
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Management Roles</p>
            <div className="grid grid-cols-2 gap-2">
              {managementRoles.map(role => {
                const disabled = role.value === 'super_admin' && !canGrantSuperAdmin;
                return (
                  <button
                    key={role.value}
                    onClick={() => !disabled && handleRoleChange(role.value)}
                    disabled={disabled}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${
                      disabled
                        ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                        : selectedRole === role.value
                        ? 'border-purple-500 bg-purple-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <p className={`font-semibold text-sm ${
                      disabled ? 'text-gray-400'
                        : selectedRole === role.value ? 'text-purple-700' : 'text-gray-800'
                    }`}>
                      {role.label}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {disabled ? 'Only Super Admin can grant this role' : role.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Permission Grid */}
          {isBypassRole ? (
            <div className="bg-purple-50 border-2 border-purple-200 rounded-xl p-4">
              <p className="text-purple-800 font-semibold">
                {getRoleLabel(selectedRole)} has full access to all dashboard cards.
              </p>
              <p className="text-purple-600 text-sm mt-1">
                No per-card permissions needed — this role bypasses all permission checks.
              </p>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-bold text-gray-700 uppercase tracking-wider">
                  Card Permissions
                </label>
                <div className="flex gap-3 text-xs">
                  <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full font-semibold">
                    {fullCount} Full
                  </span>
                  <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full font-semibold">
                    {viewCount} View
                  </span>
                  <span className="px-2 py-1 bg-gray-100 text-gray-500 rounded-full font-semibold">
                    {noneCount} None
                  </span>
                </div>
              </div>

              {/* Column headers */}
              <div className="grid grid-cols-[1fr,auto] gap-2 mb-2 px-3">
                <div></div>
                <div className="grid grid-cols-3 gap-1 text-center">
                  <span className="text-[10px] font-bold text-gray-400 uppercase w-16">None</span>
                  <span className="text-[10px] font-bold text-gray-400 uppercase w-16">View</span>
                  <span className="text-[10px] font-bold text-gray-400 uppercase w-16">Full</span>
                </div>
              </div>

              {/* Card rows */}
              <div className="space-y-1">
                {ADMIN_CARDS.map(card => {
                  const level = permissions[card.key] || 'none';
                  return (
                    <div
                      key={card.key}
                      className={`grid grid-cols-[1fr,auto] gap-2 items-center p-3 rounded-xl border transition-all ${
                        level === 'full'
                          ? 'border-green-200 bg-green-50/50'
                          : level === 'view'
                          ? 'border-yellow-200 bg-yellow-50/30'
                          : 'border-gray-100 bg-gray-50/30'
                      }`}
                    >
                      {/* Card info */}
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-lg flex-shrink-0">{card.icon}</span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">{card.title}</p>
                        </div>
                      </div>

                      {/* Radio buttons */}
                      <div className="grid grid-cols-3 gap-1">
                        {(['none', 'view', 'full'] as PermissionLevel[]).map(opt => (
                          <button
                            key={opt}
                            onClick={() => handlePermissionChange(card.key, opt)}
                            className={`w-16 py-1.5 rounded-lg text-xs font-bold transition-all ${
                              level === opt
                                ? opt === 'full'
                                  ? 'bg-green-500 text-white shadow-sm'
                                  : opt === 'view'
                                  ? 'bg-yellow-500 text-white shadow-sm'
                                  : 'bg-gray-400 text-white shadow-sm'
                                : 'bg-white border border-gray-200 text-gray-400 hover:border-gray-300'
                            }`}
                          >
                            {opt === 'none' ? 'None' : opt === 'view' ? 'View' : 'Full'}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Quick actions */}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => setPermissions(getDefaultPermissions(selectedRole))}
                  className="px-3 py-1.5 text-xs font-semibold bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Reset to Preset
                </button>
                <button
                  onClick={() => {
                    const all: Record<string, PermissionLevel> = {};
                    ALL_CARD_KEYS.forEach(k => { all[k] = 'full'; });
                    setPermissions(all);
                  }}
                  className="px-3 py-1.5 text-xs font-semibold bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors"
                >
                  All Full
                </button>
                <button
                  onClick={() => {
                    const all: Record<string, PermissionLevel> = {};
                    ALL_CARD_KEYS.forEach(k => { all[k] = 'view'; });
                    setPermissions(all);
                  }}
                  className="px-3 py-1.5 text-xs font-semibold bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 transition-colors"
                >
                  All View
                </button>
                <button
                  onClick={() => {
                    const all: Record<string, PermissionLevel> = {};
                    ALL_CARD_KEYS.forEach(k => { all[k] = 'none'; });
                    setPermissions(all);
                  }}
                  className="px-3 py-1.5 text-xs font-semibold bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
                >
                  All None
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 flex gap-3">
          <button
            onClick={onCancel}
            disabled={saving}
            className="flex-1 px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-all disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(selectedRole, permissions)}
            disabled={saving}
            className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl font-semibold hover:from-blue-600 hover:to-blue-700 transition-all disabled:opacity-50 shadow-lg"
          >
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
                Saving...
              </span>
            ) : (
              `Save as ${getRoleLabel(selectedRole)}`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
