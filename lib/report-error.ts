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

/**
 * Strip anything that could be a credential out of a string before it is
 * written to a log row someone will read later.
 *
 * A bearer token in `error_logs` is a bearer token in every backup, every
 * export and every screenshot of the health dashboard. This is belt-and-braces:
 * the reporters below are written not to include one, and this makes it true
 * even if a server error message ever echoes the header back.
 */
export function redactTokens(input: string): string {
  if (!input) return input;
  return input
    // Anything shaped like a JWT (three long base64url segments).
    .replace(/[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}/g, '[redacted-token]')
    // …and any surviving `Bearer <something>`.
    .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]');
}

const SENSITIVE_PARAM = /(token|key|secret|password|jwt|auth|code|signature)/i;

/**
 * A page URL safe to store: sensitive query values replaced, fragment dropped
 * entirely (Supabase hands back `#access_token=…` on some auth flows, and the
 * fragment has never told us anything useful about a failure anyway).
 */
export function scrubUrl(raw: string): string {
  if (!raw) return raw;
  try {
    const u = new URL(raw, 'http://localhost');
    u.hash = '';
    for (const [k, v] of Array.from(u.searchParams.entries())) {
      if (SENSITIVE_PARAM.test(k) || redactTokens(v) !== v) u.searchParams.set(k, '[redacted]');
    }
    return redactTokens(u.toString());
  } catch {
    return redactTokens(raw.split('#')[0]);
  }
}

/**
 * Report a FAILED USER ACTION — not a crash.
 *
 * WHY (Aug 17): the admin told the founder for days that she could not print.
 * `error_logs` held one row in fourteen days and nothing at all for any print,
 * so answering "what actually happened to her?" took a code audit instead of a
 * query. A failure a person reports has to be findable afterwards, or the next
 * report costs the same day of work.
 *
 * What lands in the row: the API endpoint, the HTTP status, the caller's role
 * and the error class. Never the token, and never any fragment of one.
 *
 * Fire-and-forget is correct HERE and only here — this runs in a browser, where
 * `keepalive` guarantees the request survives the tab. The receiving route
 * awaits its own writes, because in a serverless function fire-and-forget is a
 * coin flip.
 */
export interface ClientFailureReport {
  /** Coarse bucket, e.g. 'print_failure'. Becomes error_logs.type. */
  type: string;
  /** The API route that failed. Becomes error_logs.endpoint — the findable bit. */
  endpoint: string;
  /** HTTP status, or null when the request never got an answer. */
  status?: number | null;
  /** 'SessionExpiredError' | 'AuthServiceUnavailableError' | 'HttpError' | … */
  errorClass: string;
  /** What the user was shown. */
  message: string;
  /** The caller's role, when the call site knows it. */
  role?: string | null;
  /** Which button/screen, e.g. 'schedule-board:batch-print'. */
  surface?: string;
}

export function reportClientFailure(report: ClientFailureReport): void {
  try {
    const endpoint = redactTokens(report.endpoint || 'unknown');
    const message = redactTokens(report.message || 'Unknown failure');

    console.error(`[${report.type}] ${report.errorClass} ${report.status ?? ''} ${endpoint}`);

    if (typeof window === 'undefined') return;

    void fetch('/api/log-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        type: report.type,
        // The route maps `url` onto error_logs.endpoint. For a failed action the
        // useful "endpoint" is the API route, not the page — the page rides
        // along in extra.page.
        url: endpoint,
        error: message,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        timestamp: new Date().toISOString(),
        extra: {
          status: report.status ?? null,
          role: report.role ?? null,
          errorClass: report.errorClass,
          surface: report.surface ?? null,
          page: typeof location !== 'undefined' ? scrubUrl(location.href) : null,
        },
      }),
    }).catch(() => {
      /* reporting must never surface a second error to the user */
    });
  } catch {
    /* see above */
  }
}

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
        // Redacted for the same reason the print reporter redacts: a thrown
        // fetch error echoes the request it failed on, and a stack frame can
        // carry a URL — either can drag a bearer token into a table we keep.
        // These three were the only raw strings left in this file.
        error: redactTokens(error?.message ?? String(error)),
        stack: redactTokens(error?.stack ?? ''),
        componentStack: redactTokens(componentStack ?? ''),
        url: scrubUrl(window.location.href),
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
