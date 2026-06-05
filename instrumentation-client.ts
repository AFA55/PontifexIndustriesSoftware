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
  });
}

// Required for App Router navigation instrumentation.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
