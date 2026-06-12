'use client';

/**
 * WelcomeProfileModal — one-time "finish setting up your profile" nudge.
 *
 * Shown on the dashboard when the signed-in user's profile is missing the
 * basics (photo, nickname, or phone) — which happens when an account was
 * created directly by an admin (bypassing the /setup-account sequence) or the
 * user skipped those steps. Disappears forever once the profile has all three,
 * and "I'll do this later" snoozes it for the rest of the session.
 *
 * Mounted headlessly from app/dashboard/layout.tsx (PushRegistration pattern):
 * renders nothing until it has confirmed (a) a logged-in user and (b) an
 * incomplete profile.
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Phone, Sparkles, User as UserIcon, X } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

const SNOOZE_KEY = 'pontifex.welcomeProfileSnoozed';

interface Missing {
  photo: boolean;
  nickname: boolean;
  phone: boolean;
}

export default function WelcomeProfileModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [missing, setMissing] = useState<Missing>({ photo: false, nickname: false, phone: false });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = getCurrentUser();
        if (!user) return;
        if (sessionStorage.getItem(SNOOZE_KEY) === 'true') return;

        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;

        const res = await fetch('/api/my-profile', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const json = await res.json();
        const p = json?.data;
        if (!p || cancelled) return;

        const m: Missing = {
          photo: !p.profile_picture_url,
          nickname: !p.nickname,
          phone: !(p.phone_number || p.phone),
        };
        if (m.photo || m.nickname || m.phone) {
          setFirstName((p.full_name || user.name || '').split(' ')[0] || 'there');
          setMissing(m);
          setOpen(true);
        }
      } catch {
        /* never block the dashboard over a nudge */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!open) return null;

  const snooze = () => {
    try { sessionStorage.setItem(SNOOZE_KEY, 'true'); } catch { /* non-fatal */ }
    setOpen(false);
  };

  const goToProfile = () => {
    try { sessionStorage.setItem(SNOOZE_KEY, 'true'); } catch { /* non-fatal */ }
    setOpen(false);
    router.push('/dashboard/my-profile');
  };

  const items = [
    missing.photo && { icon: Camera, label: 'Add a profile photo', sub: 'So the team recognizes you across the app' },
    missing.nickname && { icon: UserIcon, label: 'Set your nickname', sub: 'What the crew actually calls you' },
    missing.phone && { icon: Phone, label: 'Confirm your phone number', sub: 'For schedule updates and reminders' },
  ].filter(Boolean) as { icon: React.ElementType; label: string; sub: string }[];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-profile-title"
    >
      <div className="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        {/* Header */}
        <div className="relative bg-gradient-to-r from-violet-600 to-indigo-600 px-6 pt-6 pb-5">
          <button
            onClick={snooze}
            aria-label="Close"
            className="absolute top-3 right-3 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-5 h-5 text-amber-300" />
            <p className="text-violet-100 text-xs font-semibold uppercase tracking-wider">Welcome aboard</p>
          </div>
          <h2 id="welcome-profile-title" className="text-white text-xl font-bold">
            Welcome, {firstName}! 👋
          </h2>
          <p className="text-violet-100/90 text-sm mt-1">
            Your account is ready. Take a minute to finish your profile so everything&apos;s set up right.
          </p>
        </div>

        {/* Checklist */}
        <div className="px-6 py-5 space-y-3">
          {items.map(({ icon: Icon, label, sub }) => (
            <div key={label} className="flex items-start gap-3">
              <span className="w-9 h-9 rounded-xl bg-violet-50 dark:bg-violet-900/30 flex items-center justify-center flex-shrink-0">
                <Icon className="w-5 h-5 text-violet-600 dark:text-violet-300" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{label}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 pt-1 flex flex-col gap-2">
          <button
            onClick={goToProfile}
            className="w-full min-h-[48px] rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-sm transition-all"
          >
            Complete my profile
          </button>
          <button
            onClick={snooze}
            className="w-full min-h-[44px] rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-sm font-medium transition-colors"
          >
            I&apos;ll do this later
          </button>
        </div>
      </div>
    </div>
  );
}
