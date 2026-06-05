'use client';

import React from 'react';
import { Zap, Briefcase, Crown } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { TOGGLEABLE_MODULES, isModuleEnabled } from '@/lib/features';

/**
 * Shared platform-console primitives (lifted from tenant-management/page.tsx).
 * Kept in one place so the list, detail, create, and switchboard surfaces all
 * speak the same visual vocabulary.
 */

/** Patriot's tenant id — hard-protected: never suspendable/cancellable in the UI. */
export const PROTECTED_TENANT_IDS = new Set<string>([
  'ee3d8081-cec2-47f3-ac23-bdc0bb2d142d',
]);

export function isProtectedTenant(t: { id?: string; company_code?: string | null }): boolean {
  if (t.id && PROTECTED_TENANT_IDS.has(t.id)) return true;
  if (t.company_code && t.company_code.toUpperCase() === 'PATRIOT') return true;
  return false;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  status: string;
  plan: string;
  max_users: number;
  max_jobs_per_month: number;
  features: Record<string, boolean> | null;
  owner_id: string | null;
  billing_email: string | null;
  primary_color?: string | null;
  logo_url?: string | null;
  company_code?: string | null;
  timezone?: string | null;
  created_at: string;
  tenant_users?: { count: number }[];
  profiles?: { count: number }[];
}

/** Bearer-token header helper (matches tenant-management/page.tsx). */
export async function getHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${session?.access_token}` };
}

export async function getJsonHeaders(): Promise<Record<string, string>> {
  const headers = await getHeaders();
  return { ...headers, 'Content-Type': 'application/json' };
}

export const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-700 border-green-200',
  suspended: 'bg-red-100 text-red-700 border-red-200',
  trial: 'bg-amber-100 text-amber-700 border-amber-200',
  cancelled: 'bg-gray-100 text-gray-500 border-gray-200',
};

export const planIcons: Record<string, React.ReactNode> = {
  starter: <Zap className="w-4 h-4 text-amber-500" />,
  professional: <Briefcase className="w-4 h-4 text-violet-500" />,
  enterprise: <Crown className="w-4 h-4 text-yellow-500" />,
};

/** Count how many toggleable modules are ON for a tenant (e.g. "18/19"). */
export function moduleSummary(features: Record<string, unknown> | null | undefined): { on: number; total: number } {
  const total = TOGGLEABLE_MODULES.length;
  const on = TOGGLEABLE_MODULES.filter((m) => isModuleEnabled(m.key, features)).length;
  return { on, total };
}

/** Profile/tenant_users count helper — prefers profiles, falls back to tenant_users. */
export function userCount(t: Tenant): number | null {
  if (t.profiles?.[0]?.count != null) return t.profiles[0].count;
  if (t.tenant_users?.[0]?.count != null) return t.tenant_users[0].count;
  return null;
}

/** Confirm modal — used for every destructive platform action. */
export function ConfirmModal({
  title,
  message,
  confirmLabel,
  destructive = true,
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full p-6">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{title}</h2>
        <div className="text-sm text-gray-600 dark:text-slate-300 mb-6">{message}</div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 px-4 py-2.5 min-h-[44px] bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`flex-1 px-4 py-2.5 min-h-[44px] text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 ${
              destructive ? 'bg-red-600 hover:bg-red-700' : 'bg-violet-600 hover:bg-violet-700'
            }`}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
