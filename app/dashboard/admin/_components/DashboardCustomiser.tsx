'use client';

/**
 * "ALSO ALLOW THEM TO REMOVE THINGS OR ADD CARDS TO THEIR DASHBOARD, ALLOW SOME
 *  SORT OF CUSTOMISABILITY TO IT." — founder, Aug 15.
 *
 * The affordance: a "Customise" toggle in the dashboard header. Off, the
 * dashboard looks exactly as it did. On, every removable block grows an ×, and
 * a panel appears at the TOP of the page holding (a) everything the user has
 * removed, one tap to bring back, and (b) every card their role permits that is
 * not on the dashboard yet, one tap to add.
 *
 * THE RECOVERY RULE: the Customise button is not itself a card and can never be
 * removed, and the restore panel sits above the content rather than below it.
 * A user who removes every single block still lands on a page with a Customise
 * button and a "Reset to default" inside it. Nobody has to call support to get
 * their dashboard back.
 *
 * The permission intersection lives in lib/dashboard-cards.ts, not here — see
 * the note at the top of that file. This component renders decisions; it does
 * not make them.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Plus, RotateCcw, Settings2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { PermissionLevel } from '@/lib/rbac';
import {
  addableFeatureCards,
  featureCardId,
  restorableSections,
  visibleFeatureCards,
  visibleSections,
  withId,
  withoutId,
  type DashboardSection,
} from '@/lib/dashboard-cards';

// ─── the hook ────────────────────────────────────────────────────────────────

export interface DashboardCardsState {
  role: string;
  permissions: Record<string, PermissionLevel> | null;
  hidden: string[];
  added: string[];
  /** Preferences are still loading — render the default layout meanwhile. */
  loading: boolean;
  /** The preference could not be persisted; changes are session-only. */
  saveError: boolean;
  editing: boolean;
  setEditing: (v: boolean) => void;
  hideSection: (id: string) => void;
  restoreSection: (id: string) => void;
  addCard: (cardKey: string) => void;
  removeCard: (cardKey: string) => void;
  reset: () => void;
  isVisible: (sections: DashboardSection[], id: string) => boolean;
}

/**
 * Loads the user's role permissions and their stored layout, and persists every
 * change. Optimistic: the UI moves immediately, the PUT catches up.
 */
export function useDashboardCards(fallbackRole: string): DashboardCardsState {
  const [role, setRole] = useState(fallbackRole);
  const [permissions, setPermissions] = useState<Record<string, PermissionLevel> | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [added, setAdded] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) return;
        const headers = { Authorization: `Bearer ${session.access_token}` };

        const [permRes, prefRes] = await Promise.all([
          fetch('/api/card-permissions/me', { headers }),
          fetch('/api/my-profile/dashboard-cards', { headers }),
        ]);

        if (!cancelled && permRes.ok) {
          const json = await permRes.json();
          if (json.role) setRole(json.role);
          setPermissions(json.permissions ?? {});
        }
        if (!cancelled && prefRes.ok) {
          const json = await prefRes.json();
          setHidden(json.data?.hidden ?? []);
          setAdded(json.data?.added ?? []);
        }
      } catch {
        // Fall through to defaults — a dashboard that renders everything is a
        // far better failure than one that renders nothing.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(async (next: { hidden?: string[]; added?: string[] }) => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setSaveError(true);
        return;
      }
      const res = await fetch('/api/my-profile/dashboard-cards', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(next),
      });
      setSaveError(!res.ok);
    } catch {
      setSaveError(true);
    }
  }, []);

  const hideSection = useCallback(
    (id: string) => {
      setHidden((prev) => {
        const next = withId(prev, id);
        persist({ hidden: next });
        return next;
      });
    },
    [persist]
  );

  const restoreSection = useCallback(
    (id: string) => {
      setHidden((prev) => {
        const next = withoutId(prev, id);
        persist({ hidden: next });
        return next;
      });
    },
    [persist]
  );

  const addCard = useCallback(
    (cardKey: string) => {
      setAdded((prev) => {
        const next = withId(prev, featureCardId(cardKey));
        persist({ added: next });
        return next;
      });
    },
    [persist]
  );

  const removeCard = useCallback(
    (cardKey: string) => {
      setAdded((prev) => {
        const next = withoutId(prev, featureCardId(cardKey));
        persist({ added: next });
        return next;
      });
    },
    [persist]
  );

  const reset = useCallback(() => {
    setHidden([]);
    setAdded([]);
    persist({ hidden: [], added: [] });
  }, [persist]);

  const isVisible = useCallback(
    (sections: DashboardSection[], id: string) =>
      visibleSections(sections, { role, permissions, hidden }).some((s) => s.id === id),
    [role, permissions, hidden]
  );

  return {
    role,
    permissions,
    hidden,
    added,
    loading,
    saveError,
    editing,
    setEditing,
    hideSection,
    restoreSection,
    addCard,
    removeCard,
    reset,
    isVisible,
  };
}

// ─── the toggle button (lives in the page header) ────────────────────────────

export function CustomiseButton({ state }: { state: DashboardCardsState }) {
  const active = state.editing;
  return (
    <button
      onClick={() => state.setEditing(!active)}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 px-3 min-h-[44px] rounded-lg text-sm font-semibold transition-colors ${
        active
          ? 'bg-brand text-white hover:bg-brand-dark'
          : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-300 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700'
      }`}
    >
      {active ? <Check className="w-4 h-4" /> : <Settings2 className="w-4 h-4" />}
      {active ? 'Done' : 'Customise'}
    </button>
  );
}

// ─── the edit panel (restore + add) ──────────────────────────────────────────

export function CustomisePanel({
  state,
  sections,
}: {
  state: DashboardCardsState;
  sections: DashboardSection[];
}) {
  const ctx = {
    role: state.role,
    permissions: state.permissions,
    hidden: state.hidden,
    added: state.added,
  };

  const removed = restorableSections(sections, ctx);
  const addable = addableFeatureCards(ctx);
  const nothingChanged = state.hidden.length === 0 && state.added.length === 0;

  if (!state.editing) return null;

  return (
    <div className="rounded-xl border-2 border-dashed border-brand/40 bg-brand/[0.04] dark:bg-brand/[0.08] p-4 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            Customising your dashboard
          </p>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
            Tap the × on any block to remove it. Bring things back from here any time.
          </p>
        </div>
        {!nothingChanged && (
          <button
            onClick={state.reset}
            className="inline-flex items-center gap-1.5 px-3 min-h-[44px] rounded-lg text-xs font-semibold text-gray-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset to default
          </button>
        )}
      </div>

      {state.saveError && (
        <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-lg px-3 py-2">
          Your layout could not be saved, so these changes will only last for this
          visit. Everything else on the dashboard is unaffected.
        </p>
      )}

      {/* Removed blocks — the restore path, never buried */}
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500 mb-2">
          Removed
        </p>
        {removed.length === 0 ? (
          <p className="text-xs text-gray-500 dark:text-slate-400">
            Nothing removed — your dashboard is complete.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {removed.map((s) => (
              <button
                key={s.id}
                onClick={() => state.restoreSection(s.id)}
                title={s.description}
                className="inline-flex items-center gap-1.5 px-3 min-h-[44px] rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 border border-gray-200 dark:border-slate-700 hover:border-brand hover:text-brand transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Feature cards this user's ROLE permits and has not added yet */}
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500 mb-2">
          Add a card
        </p>
        {addable.length === 0 ? (
          <p className="text-xs text-gray-500 dark:text-slate-400">
            Every card your access allows is already on your dashboard.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {addable.map((c) => (
              <button
                key={c.key}
                onClick={() => state.addCard(c.key)}
                className="flex items-center gap-2 text-left px-3 py-3 min-h-[44px] rounded-lg bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:border-brand transition-colors"
              >
                <span className="text-lg leading-none flex-shrink-0" aria-hidden>
                  {c.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-gray-900 dark:text-white truncate">
                    {c.title}
                  </span>
                  <span className="block text-[10px] text-gray-500 dark:text-slate-400 truncate">
                    {c.description}
                  </span>
                </span>
                <Plus className="w-4 h-4 text-brand flex-shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── the wrapper that puts an × on a block ───────────────────────────────────

export function Removable({
  state,
  sections,
  id,
  children,
}: {
  state: DashboardCardsState;
  sections: DashboardSection[];
  id: string;
  children: React.ReactNode;
}) {
  if (!state.isVisible(sections, id)) return null;

  const label = sections.find((s) => s.id === id)?.label ?? 'this block';

  if (!state.editing) return <>{children}</>;

  return (
    <div className="relative rounded-xl outline outline-2 outline-dashed outline-offset-4 outline-brand/40">
      {children}
      <button
        onClick={() => state.hideSection(id)}
        aria-label={`Remove ${label} from my dashboard`}
        title={`Remove ${label}`}
        className="absolute -top-3 -right-3 w-11 h-11 flex items-center justify-center z-10"
      >
        <span className="w-8 h-8 rounded-full bg-red-500 hover:bg-red-600 text-white shadow-lg flex items-center justify-center transition-colors">
          <X className="w-4 h-4" />
        </span>
      </button>
    </div>
  );
}

// ─── the added feature-card tiles ────────────────────────────────────────────

export function AddedFeatureCards({ state }: { state: DashboardCardsState }) {
  const cards = visibleFeatureCards({
    role: state.role,
    permissions: state.permissions,
    added: state.added,
  });

  if (cards.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {cards.map((c) => (
        <div key={c.key} className="relative">
          <Link
            href={c.href}
            className="flex items-start gap-3 h-full bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 p-4 hover:shadow-md transition-shadow"
          >
            <span
              className={`w-10 h-10 rounded-xl bg-gradient-to-br ${c.bgColor} flex items-center justify-center text-lg flex-shrink-0`}
              aria-hidden
            >
              {c.icon}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-gray-900 dark:text-white truncate">
                {c.title}
              </span>
              <span className="block text-[11px] text-gray-500 dark:text-slate-400 line-clamp-2">
                {c.description}
              </span>
            </span>
          </Link>
          {state.editing && (
            <button
              onClick={() => state.removeCard(c.key)}
              aria-label={`Remove ${c.title} from my dashboard`}
              title={`Remove ${c.title}`}
              className="absolute -top-3 -right-3 w-11 h-11 flex items-center justify-center z-10"
            >
              <span className="w-8 h-8 rounded-full bg-red-500 hover:bg-red-600 text-white shadow-lg flex items-center justify-center transition-colors">
                <X className="w-4 h-4" />
              </span>
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
