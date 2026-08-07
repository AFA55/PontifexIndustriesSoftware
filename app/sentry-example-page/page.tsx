'use client';

/**
 * Sentry verification page.
 *
 * WHY THIS EXISTS: Sentry's own instrumentation guide is explicit that the job
 * isn't done until a real event has been SEEN in Sentry — "don't stop at 'go
 * check your dashboard'". This page is the one-click way to produce that event.
 *
 * As of 7 Aug 2026 Sentry has received ZERO events from this app (confirmed via
 * the Sentry MCP: no issues in 7 days). The SDK code is complete and correct —
 * client init, server init, onRequestError, global-error.tsx and
 * withSentryConfig are all in place. The missing piece is the DSN reaching a
 * PRODUCTION BUILD: NEXT_PUBLIC_SENTRY_DSN is inlined at build time, so setting
 * it in Vercel does nothing until a new build runs.
 *
 * Once the DSN is live, open /sentry-example-page and press a button. If the
 * error appears in Sentry, instrumentation is proven end to end.
 *
 * Safe to leave in place: it throws only when someone deliberately presses a
 * button, and it is linked from nowhere.
 */

import { useState } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function SentryExamplePage() {
  const [serverResult, setServerResult] = useState<string | null>(null);

  // Whether the DSN actually made it into THIS build. Inlined at build time, so
  // this is the honest answer for the bundle you are currently running.
  const dsnPresent = !!process.env.NEXT_PUBLIC_SENTRY_DSN;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Sentry check</h1>
          <p className="text-sm text-slate-400 mt-1">
            Press a button, then look in Sentry. If the error shows up there,
            error reporting is working.
          </p>
        </div>

        {/* The single most useful thing on this page: does this build have a DSN? */}
        <div
          className={`rounded-xl border p-4 ${
            dsnPresent
              ? 'border-emerald-500/40 bg-emerald-500/10'
              : 'border-amber-500/40 bg-amber-500/10'
          }`}
        >
          <p className="font-semibold">
            {dsnPresent
              ? 'This build HAS a Sentry DSN.'
              : 'This build has NO Sentry DSN — nothing will be reported.'}
          </p>
          {!dsnPresent && (
            <p className="text-sm text-amber-200/80 mt-2 leading-relaxed">
              NEXT_PUBLIC_SENTRY_DSN is baked in when the app builds. Set it in
              Vercel for the <strong>Production</strong> environment, then
              <strong> redeploy</strong> — setting the variable alone changes
              nothing until a new build runs.
            </p>
          )}
        </div>

        <button
          onClick={() => {
            throw new Error('Pontifex Sentry test — client-side error');
          }}
          className="w-full min-h-[52px] rounded-xl bg-red-600 hover:bg-red-500 font-bold transition-colors"
        >
          Throw a browser error
        </button>

        <button
          onClick={async () => {
            setServerResult('Sending…');
            try {
              const res = await fetch('/api/sentry-example-api');
              setServerResult(
                res.ok
                  ? 'Unexpected: the API returned OK.'
                  : `Server responded ${res.status} — check Sentry for the error.`
              );
            } catch {
              setServerResult('Request failed — check Sentry.');
            }
          }}
          className="w-full min-h-[52px] rounded-xl bg-orange-600 hover:bg-orange-500 font-bold transition-colors"
        >
          Throw a server error
        </button>

        <button
          onClick={() => {
            Sentry.captureMessage('Pontifex Sentry test — captureMessage', 'info');
            setServerResult('Message sent to Sentry (no crash).');
          }}
          className="w-full min-h-[52px] rounded-xl bg-slate-700 hover:bg-slate-600 font-bold transition-colors"
        >
          Send a message without crashing
        </button>

        {serverResult && (
          <p className="text-sm text-slate-300 bg-white/5 rounded-lg p-3">{serverResult}</p>
        )}
      </div>
    </main>
  );
}
