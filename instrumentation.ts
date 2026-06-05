/**
 * Server + edge runtime instrumentation (Next.js App Router).
 *
 * Sentry is fully GATED on a DSN being present AND NODE_ENV=production, so:
 *   • Local dev / CI without a DSN  → complete no-op (zero behavior change).
 *   • Production with SENTRY_DSN set → captures server/edge errors + traces.
 *
 * Founder action: set SENTRY_DSN (+ optional SENTRY_AUTH_TOKEN for source maps)
 * in the Vercel production environment to switch it on.
 */
import * as Sentry from '@sentry/nextjs';

const DSN = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

export async function register() {
  if (!DSN) return;
  if (
    process.env.NEXT_RUNTIME === 'nodejs' ||
    process.env.NEXT_RUNTIME === 'edge'
  ) {
    Sentry.init({
      dsn: DSN,
      enabled: process.env.NODE_ENV === 'production',
      tracesSampleRate: 0.1,
    });
  }
}

// Lets Next.js report nested React Server Component errors to Sentry.
export const onRequestError = Sentry.captureRequestError;
