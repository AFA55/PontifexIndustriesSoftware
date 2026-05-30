'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronLeft,
  Bell,
  Smartphone,
  MessageSquare,
  Mail,
  Loader2,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { apiFetch } from '@/lib/api-client';

type ChannelKey = 'push_enabled' | 'sms_enabled' | 'email_enabled';

interface PreferenceRow {
  category: string;
  push_enabled: boolean;
  sms_enabled: boolean;
  email_enabled: boolean;
}

// Friendly labels + descriptions, in display order.
const CATEGORY_META: { category: string; label: string; description: string }[] = [
  {
    category: 'clock_in_reminder',
    label: 'Clock-in reminders',
    description: 'A nudge just before and after your scheduled start so you never miss a punch.',
  },
  {
    category: 'work_performed_reminder',
    label: 'Log-your-work reminders',
    description: 'Reminders to log the work you performed during the day.',
  },
  {
    category: 'time_off_status',
    label: 'Time-off request updates',
    description: 'When your time-off request is approved, denied, or changed.',
  },
  {
    category: 'job_dispatched',
    label: 'New job dispatched',
    description: 'When a new job is assigned and dispatched to you.',
  },
  {
    category: 'document_to_sign',
    label: 'Documents to sign / fill out',
    description: 'When a document is waiting for your signature or input.',
  },
  {
    category: 'maintenance_update',
    label: 'Maintenance request updates',
    description: 'Status changes on equipment or vehicle maintenance you reported.',
  },
];

const CHANNELS: { key: ChannelKey; label: string; icon: typeof Smartphone }[] = [
  { key: 'push_enabled', label: 'Push', icon: Smartphone },
  { key: 'sms_enabled', label: 'SMS', icon: MessageSquare },
  { key: 'email_enabled', label: 'Email', icon: Mail },
];

function Toggle({
  enabled,
  onChange,
  label,
  Icon,
  disabled,
}: {
  enabled: boolean;
  onChange: () => void;
  label: string;
  Icon: typeof Smartphone;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className="flex items-center gap-2 min-h-[44px] disabled:opacity-50"
    >
      <span className="flex items-center gap-1.5 text-sm font-medium text-slate-600 dark:text-slate-300">
        <Icon className="w-4 h-4" />
        <span className="hidden sm:inline">{label}</span>
      </span>
      <span
        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
          enabled ? 'bg-violet-600' : 'bg-slate-300 dark:bg-slate-600'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
            enabled ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  );
}

export default function NotificationSettingsPage() {
  const router = useRouter();
  const [prefs, setPrefs] = useState<PreferenceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  // Per-category transient error (revert feedback).
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  // Per-category "saved" pulse.
  const [savedFlash, setSavedFlash] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      router.push('/login');
    }
  }, [router]);

  const loadPrefs = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const json = await apiFetch<{ success: boolean; data: PreferenceRow[] }>(
        '/api/notification-preferences'
      );
      setPrefs(json.data || []);
    } catch {
      setLoadError('Could not load your notification settings. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPrefs();
  }, [loadPrefs]);

  const handleToggle = useCallback(
    async (category: string, channel: ChannelKey) => {
      const current = prefs.find((p) => p.category === category);
      if (!current) return;

      const optimistic: PreferenceRow = { ...current, [channel]: !current[channel] };

      // Optimistic update.
      setPrefs((prev) => prev.map((p) => (p.category === category ? optimistic : p)));
      setRowErrors((prev) => {
        const next = { ...prev };
        delete next[category];
        return next;
      });

      try {
        await apiFetch('/api/notification-preferences', {
          method: 'PUT',
          body: JSON.stringify({
            category,
            push_enabled: optimistic.push_enabled,
            sms_enabled: optimistic.sms_enabled,
            email_enabled: optimistic.email_enabled,
          }),
        });
        // Brief "saved" flash.
        setSavedFlash((prev) => ({ ...prev, [category]: true }));
        setTimeout(() => {
          setSavedFlash((prev) => {
            const next = { ...prev };
            delete next[category];
            return next;
          });
        }, 1500);
      } catch {
        // Revert.
        setPrefs((prev) => prev.map((p) => (p.category === category ? current : p)));
        setRowErrors((prev) => ({ ...prev, [category]: "Couldn't save that change. Please try again." }));
      }
    },
    [prefs]
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50/30 dark:bg-[#0b0618] dark:from-[#0b0618] dark:via-[#0b0618] dark:to-[#0b0618]">
      <div className="container mx-auto px-4 md:px-6 py-6 max-w-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link
            href="/dashboard/my-profile"
            className="p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl transition-colors"
            aria-label="Back to profile"
          >
            <ChevronLeft className="w-5 h-5 text-slate-600 dark:text-slate-400" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2 text-slate-900 dark:text-white">
              <Bell className="w-6 h-6 text-violet-600" />
              Notifications
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Choose how you want to be reached for each alert.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
          </div>
        ) : loadError ? (
          <div className="bg-white dark:bg-white/[0.05] rounded-2xl ring-1 ring-slate-200 dark:ring-white/10 p-6 text-center shadow-sm">
            <AlertCircle className="w-10 h-10 mx-auto mb-3 text-rose-400" />
            <p className="text-slate-600 dark:text-slate-300 mb-4">{loadError}</p>
            <button
              onClick={loadPrefs}
              className="inline-flex items-center justify-center gap-2 min-h-[44px] py-3 px-4 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold transition-colors"
            >
              <RefreshCw className="w-4 h-4" /> Try again
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {CATEGORY_META.map((meta) => {
              const row =
                prefs.find((p) => p.category === meta.category) || {
                  category: meta.category,
                  push_enabled: true,
                  sms_enabled: false,
                  email_enabled: false,
                };
              const error = rowErrors[meta.category];
              const saved = savedFlash[meta.category];
              return (
                <div
                  key={meta.category}
                  className="bg-white dark:bg-white/[0.05] rounded-2xl ring-1 ring-slate-200 dark:ring-white/10 p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="min-w-0">
                      <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        {meta.label}
                        {saved && (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 animate-in fade-in" />
                        )}
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {meta.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-100 dark:border-white/10 pt-3">
                    {CHANNELS.map((ch) => (
                      <Toggle
                        key={ch.key}
                        enabled={row[ch.key]}
                        onChange={() => handleToggle(meta.category, ch.key)}
                        label={ch.label}
                        Icon={ch.icon}
                      />
                    ))}
                  </div>

                  {error && (
                    <p className="text-xs text-rose-500 dark:text-rose-400 mt-2 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      {error}
                    </p>
                  )}
                </div>
              );
            })}

            {/* Footnote */}
            <p className="text-xs text-slate-400 dark:text-slate-500 px-1 pt-2 leading-relaxed">
              Clock-in reminders help you avoid missed punches. Push works on the mobile app; SMS may
              incur carrier rates.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
