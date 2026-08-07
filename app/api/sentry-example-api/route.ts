export const dynamic = 'force-dynamic';

/**
 * Deliberately throws, so /sentry-example-page can prove SERVER-side reporting
 * works — the half that instrumentation.ts + onRequestError handle, and the
 * half a browser-only test would miss entirely.
 *
 * Reached only from that page; linked from nowhere else.
 */
export function GET() {
  throw new Error('Pontifex Sentry test — server-side error');
}
