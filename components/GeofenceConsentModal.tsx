'use client';

/**
 * GeofenceConsentModal — the in-app "prominent disclosure" for background location,
 * shown BEFORE the OS permission prompt (Apple + Google requirement). Uses Google's
 * canonical framing ("even when the app is closed or not in use"), states the purpose,
 * scope (on the clock only), no-sale, retention, and opt-out, and offers an explicit
 * Agree / Not now. "Not now" must NOT trigger the OS permission prompt.
 */

import { MapPin } from 'lucide-react';

export default function GeofenceConsentModal({
  onAgree,
  onDecline,
}: {
  onAgree: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-4 bg-black/60">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-white/10 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-11 h-11 rounded-2xl bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center">
            <MapPin className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Background location while you&apos;re on the clock</h2>
        </div>

        <div className="text-sm text-slate-600 dark:text-white/70 space-y-3 leading-relaxed">
          <p>
            When you&apos;re clocked in or have an assigned job, Pontifex collects your location in the
            background — <strong>even when the app is closed or not in use</strong> — to automatically
            record when you arrive at a job site and to remind you to clock out when you return to the shop.
          </p>
          <p>
            Your location is used <strong>only</strong> for timekeeping while you&apos;re on the clock. It is
            <strong> never sold or shared</strong>, and it is deleted with your timecard records. You can turn
            it off anytime in Settings — clock-in will still work.
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={onAgree}
            className="w-full py-3 rounded-xl font-bold text-sm bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
          >
            Agree
          </button>
          <button
            type="button"
            onClick={onDecline}
            className="w-full py-3 rounded-xl font-semibold text-sm border border-slate-300 dark:border-white/20 text-slate-600 dark:text-white/70 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
