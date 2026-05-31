'use client';

/**
 * DevWarningFilter — dev-only suppression of ONE known Next.js 15 framework
 * false-positive.
 *
 * React logs: `Each child in a list should have a unique "key" prop. Check the
 * render method of \`ClientSegmentRoot\`.` — attributed to Next's *internal*
 * ClientSegmentRoot (which renders the segment's [loading, page] array without
 * keys). The entire call stack is framework code; every list in OUR codebase is
 * correctly keyed (verified). The permanent fix is a Next.js version bump, which
 * we're deferring while a build is in App Review.
 *
 * This runs at module-eval time on the client — after Next's own dev console hook
 * is installed (framework chunk loads first) and before React renders — so it
 * reliably intercepts the warning. It drops ONLY this exact framework message:
 * any other error, and any genuine missing-key warning from our OWN components
 * (whose owner is the real component name, not ClientSegmentRoot), still surfaces.
 * It is a no-op in production (React strips the warning there).
 */
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  const original = console.error;
  // Guard against double-patching on fast-refresh.
  if (!(console.error as { __pontifexPatched?: boolean }).__pontifexPatched) {
    const patched = function (...args: unknown[]) {
      const first = typeof args[0] === 'string' ? args[0] : '';
      const mentionsSegmentRoot = args.some(
        (a) => typeof a === 'string' && a.includes('ClientSegmentRoot'),
      );
      if (first.includes('unique "key" prop') && mentionsSegmentRoot) return;
      (original as (...a: unknown[]) => void).apply(console, args);
    } as typeof console.error & { __pontifexPatched?: boolean };
    patched.__pontifexPatched = true;
    console.error = patched;
  }
}

export default function DevWarningFilter() {
  return null;
}
