'use client';

/**
 * ModuleGuard — per-page enforcement of the per-tenant module switchboard.
 *
 * Completes the sidebar gating already shipped: a direct URL to a module a
 * tenant has DISABLED shows a friendly "not enabled" screen instead of loading
 * the page.
 *
 * SAFETY (PRIME DIRECTIVE — never block a live client):
 *  - Additive + default-ON: `isModuleEnabled` (lib/features.ts) returns TRUE for
 *    core/unknown/absent keys. A page only blocks when an admin explicitly toggles
 *    that module OFF in the platform switchboard.
 *  - NO FALSE-BLOCK FLASH: `blocked` is always false while branding is `loading`
 *    (and during load `branding.features` is `{}` → everything is enabled anyway),
 *    so a valid user never sees a blocked state during page/feature load.
 *
 * Two forms (use whichever minimizes the diff):
 *  - `useModuleGate(key)` → `{ blocked, fallback }`. For big existing pages:
 *    call the hook unconditionally at the top with the other hooks, then add
 *    `if (gate.blocked) return gate.fallback;` alongside the existing guard returns.
 *  - `<ModuleGuard moduleKey>…</ModuleGuard>` → convenience wrapper.
 */

import React from 'react';
import Link from 'next/link';
import { Lock, ArrowLeft } from 'lucide-react';
import { useBranding } from '@/lib/branding-context';
import { isModuleEnabled, type ModuleKey } from '@/lib/features';

function ModuleBlockedCard() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 shadow-xl p-8 text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-100 dark:bg-violet-500/10">
          <Lock className="h-8 w-8 text-violet-600 dark:text-violet-400" />
        </div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          This module isn&apos;t enabled for your account
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Contact your administrator to request access.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-slate-900 dark:bg-slate-100 px-5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}

/**
 * Hook form. Call unconditionally at the top of the page with the other hooks.
 * `blocked` is false while branding is loading (no false-block flash) and only
 * true once a canonical key (or legacy alias) is explicitly stored `false`.
 */
export function useModuleGate(moduleKey: ModuleKey): {
  blocked: boolean;
  fallback: React.ReactNode;
} {
  const { branding, loading } = useBranding();
  const blocked = !loading && !isModuleEnabled(moduleKey, branding.features);
  return { blocked, fallback: <ModuleBlockedCard /> };
}

/**
 * Wrapper form. Renders the fallback when blocked, else children.
 */
export function ModuleGuard({
  moduleKey,
  children,
}: {
  moduleKey: ModuleKey;
  children: React.ReactNode;
}) {
  const { blocked, fallback } = useModuleGate(moduleKey);
  if (blocked) return <>{fallback}</>;
  return <>{children}</>;
}

export default ModuleGuard;
