'use client';

import { useMemo, useState } from 'react';
import { Lock, Save, Info, RefreshCw } from 'lucide-react';
import { useNotifications } from '@/contexts/NotificationContext';
import {
  FEATURE_MODULES, TOGGLEABLE_MODULES, isModuleEnabled,
} from '@/lib/features';
import { type Tenant, getJsonHeaders } from '@/components/platform/shared';

/**
 * Module switchboard — WRITE-ONLY in v1 (PLATFORM_CONSOLE_PLAN.md §4).
 *
 * Toggling records intent in tenants.features. It does NOT change app behavior
 * yet (gating reads come in a later, separately-reviewed phase) — that protects
 * Patriot/Apex. Save merges the canonical toggle keys into the existing
 * features map and PATCHes the tenant. Core modules render as locked "Always on"
 * rows and are NEVER written.
 */
export default function ModuleSwitchboard({
  tenant,
  onSaved,
}: {
  tenant: Tenant;
  onSaved?: (features: Record<string, boolean>) => void;
}) {
  const { success, error: showError } = useNotifications();
  const [saving, setSaving] = useState(false);

  // Initial toggle state from isModuleEnabled (normalizes legacy aliases).
  const initial = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const m of TOGGLEABLE_MODULES) map[m.key] = isModuleEnabled(m.key, tenant.features);
    return map;
  }, [tenant.features]);

  const [state, setState] = useState<Record<string, boolean>>(initial);

  const dirty = useMemo(
    () => TOGGLEABLE_MODULES.some((m) => state[m.key] !== initial[m.key]),
    [state, initial]
  );

  const coreModules = FEATURE_MODULES.filter((m) => m.core);

  const toggle = (key: string) => setState((s) => ({ ...s, [key]: !s[key] }));

  const handleSave = async () => {
    setSaving(true);
    try {
      // Start from the tenant's current features; merge ONLY toggleable keys.
      // NEVER write a core key (registry contract — lib/features.ts).
      const merged: Record<string, boolean> = { ...(tenant.features || {}) };
      for (const m of TOGGLEABLE_MODULES) merged[m.key] = !!state[m.key];

      const headers = await getJsonHeaders();
      const res = await fetch(`/api/admin/tenants/${tenant.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ features: merged }),
      });
      const json = await res.json();
      if (json.success) {
        success('Module configuration saved', 'Stored as configuration — gating activates in a later phase.');
        onSaved?.(merged);
      } else {
        showError('Save failed', json.error);
      }
    } catch (err: any) {
      showError('Error', err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Write-only note */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900">
        <Info className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-amber-800 dark:text-amber-300">
          Saved as configuration; module gating activates in a later phase. Toggling here records intent
          on this tenant and does <strong>not</strong> change the app&rsquo;s behavior yet.
        </p>
      </div>

      {/* Toggleable modules */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 divide-y divide-gray-100 dark:divide-slate-800">
        {TOGGLEABLE_MODULES.map((m) => {
          const on = !!state[m.key];
          return (
            <div key={m.key} className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{m.label}</p>
                <p className="text-xs text-gray-500 dark:text-slate-400">{m.description}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={`Toggle ${m.label}`}
                onClick={() => toggle(m.key)}
                className={`relative flex-shrink-0 w-12 h-7 min-h-[28px] rounded-full transition-colors ${
                  on ? 'bg-brand' : 'bg-gray-300 dark:bg-slate-700'
                }`}
              >
                <span
                  className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    on ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          );
        })}
      </div>

      {/* Core (always on) */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-2 px-1">
          Core modules &middot; always on
        </p>
        <div className="bg-gray-50 dark:bg-slate-900/50 rounded-2xl border border-gray-200 dark:border-slate-800 divide-y divide-gray-100 dark:divide-slate-800">
          {coreModules.map((m) => (
            <div key={m.key} className="flex items-center justify-between gap-4 p-4 opacity-70">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-600 dark:text-slate-300">{m.label}</p>
                <p className="text-xs text-gray-400 dark:text-slate-500">{m.description}</p>
              </div>
              <span className="flex items-center gap-1.5 text-xs font-medium text-gray-400 flex-shrink-0">
                <Lock className="w-3.5 h-3.5" /> Always on
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Save */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saving}
          className="px-5 py-2.5 min-h-[44px] bg-brand hover:bg-brand-dark disabled:bg-gray-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold flex items-center gap-2 transition-colors"
        >
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving…' : dirty ? 'Save Configuration' : 'No Changes'}
        </button>
      </div>
    </div>
  );
}
