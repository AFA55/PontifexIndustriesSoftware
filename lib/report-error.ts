'use client';

/**
 * Tell someone when the app crashes.
 *
 * Every crash screen in this platform says "our team has been notified". Until
 * now that was false: an audit found 0 of 60 error boundaries reporting
 * anywhere, `Sentry.captureException` appearing in exactly one file in the whole
 * repo, and `/api/log-error` — which exists precisely for this — with no callers
 * at all. The measured cost: a feature broken for two months, another failing
 * for twelve days, and a three-minute outage nobody ever knew about.
 *
 * Next.js `error.tsx` boundaries catch errors BEFORE `window.onerror`, so
 * Sentry's automatic browser instrumentation never sees them. They have to be
 * reported by hand, from inside the boundary.
 *
 * Never throws. A reporter that can fail inside an error handler turns one
 * broken page into a broken app.
 */

export interface ClientErrorReport {
  error: Error & { digest?: string };
  /** Which boundary caught it — 'global', 'dashboard', a route segment. */
  boundary: string;
  componentStack?: string;
}

export function reportClientError({ error, boundary, componentStack }: ClientErrorReport): void {
  try {
    // Console first and unconditionally: it is the only channel that cannot
    // itself fail, and Vercel captures it.
    console.error(`[${boundary}]`, error);

    // Sentry, when it is present. Imported off the global rather than as a
    // module so a missing or failed Sentry bundle cannot break this file.
    const sentry = (globalThis as { Sentry?: { captureException?: (e: unknown, c?: unknown) => void } })
      .Sentry;
    sentry?.captureException?.(error, {
      tags: { boundary },
      extra: { digest: error?.digest, componentStack },
    });

    if (typeof window === 'undefined') return;

    // `keepalive` so the report still goes out when the boundary immediately
    // navigates or the tab is closing — without it, the most interesting
    // crashes are exactly the ones that never get sent.
    void fetch('/api/log-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        type: `boundary:${boundary}`,
        error: error?.message ?? String(error),
        stack: error?.stack ?? '',
        componentStack: componentStack ?? '',
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
        extra: { digest: error?.digest ?? null },
      }),
    }).catch(() => {
      /* reporting must never surface a second error to the user */
    });
  } catch {
    /* see above */
  }
}
