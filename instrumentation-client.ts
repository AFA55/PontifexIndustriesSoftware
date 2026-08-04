/**
 * Client-side instrumentation (Next.js 15.3+ App Router).
 *
 * Gated on NEXT_PUBLIC_SENTRY_DSN + production, so without a DSN this is a no-op.
 * Session Replay is disabled (sampleRate 0) to avoid capturing operator PII on the
 * customer-signature / timecard screens — flip on later if desired.
 */
import * as Sentry from '@sentry/nextjs';

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (DSN) {
  Sentry.init({
    dsn: DSN,
    enabled: process.env.NODE_ENV === 'production',
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,

    // Noise floor. These are network/browser CONDITIONS, not defects — an
    // operator driving through a dead zone generates them constantly, and on
    // the free tier that noise would bury the real signal.
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      'Non-Error promise rejection captured',
      'Failed to fetch',
      'NetworkError when attempting to fetch resource',
      'Load failed',
      'AbortError',
    ],

    beforeSend(event) {
      // NEVER ship credentials to a third party. Setup/signature links carry a
      // token in the query string, and those URLs ride along on error reports.
      if (event.request?.url) {
        try {
          const u = new URL(event.request.url);
          for (const k of ['token', 'access_token', 'refresh_token', 'apikey', 'key']) {
            if (u.searchParams.has(k)) u.searchParams.set(k, '[redacted]');
          }
          event.request.url = u.toString();
        } catch { /* not a parseable URL — leave it */ }
      }
      return event;
    },
  });
}

// Required for App Router navigation instrumentation.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
