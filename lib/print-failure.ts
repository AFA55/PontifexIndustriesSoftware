'use client';

/**
 * ONE WAY TO FETCH A PRINTABLE TICKET.
 *
 * WHY THIS EXISTS (Aug 17): the office admin could print a ticket from the job
 * page and not from the schedule board. Same person, same permissions, same
 * PDF route — different button. The Aug 15 session fixed the malformed-token
 * failure (see lib/authed-fetch.ts) and wired the fix into exactly one of the
 * five print paths. The other four still built their own `Bearer` header by
 * hand, so they still sent whatever was in storage and still died on the first
 * 401 with no refresh and no retry.
 *
 * Every print button now goes through here, which gets all four of the things
 * that were missing in at least one place:
 *
 *   1. the token shape check + single refresh-and-retry (authedFetch),
 *   2. a failure the user is actually TOLD about — a print that silently does
 *      nothing leaves someone standing at a printer,
 *   3. "sign in again" and "the sign-in service is unreachable" as DIFFERENT
 *      sentences, because sending someone to a login page during an auth
 *      outage sends them somewhere that also will not work,
 *   4. a row in `error_logs`, so the next person who says "I can't print" can
 *      be answered with a query instead of a code audit.
 */

import { authedFetch, isSessionExpired, isAuthServiceUnavailable } from './authed-fetch';
import { reportClientFailure } from './report-error';
import { getCurrentUser } from './auth';

export type PrintErrorClass =
  | 'SessionExpiredError'
  | 'AuthServiceUnavailableError'
  | 'HttpError'
  | 'NetworkError';

export interface PrintFailure {
  ok: false;
  errorClass: PrintErrorClass;
  /** HTTP status, or null when the request never got an answer. */
  status: number | null;
  /** The sentence to show the user. Already non-technical. */
  message: string;
  /** True only when signing in again is the actual remedy. */
  needsLogin: boolean;
}

export type PrintResult = { ok: true; blob: Blob } | PrintFailure;

/** A failure whose only fix is another attempt later — not a per-job problem. */
export function isAuthPrintFailure(f: PrintFailure): boolean {
  return f.errorClass === 'SessionExpiredError' || f.errorClass === 'AuthServiceUnavailableError';
}

/**
 * The heading for a print failure — the same split the board's toast makes, so
 * the two surfaces cannot describe one failure two ways.
 */
export function printFailureTitle(f: PrintFailure): string {
  return f.needsLogin ? 'Session Expired' : 'Print Failed';
}

/**
 * The same thing for a surface that only has `alert()` (the two schedule-board
 * panels). They used to concatenate: `Print failed — We could not reach the
 * sign-in service. Your login is fine…` — a heading that contradicts its own
 * sentence. The heading belongs on its own line.
 */
export function printFailureAlertText(f: PrintFailure): string {
  return `${printFailureTitle(f)}\n\n${f.message}`;
}

/**
 * Turn a thrown error into a sentence and a class.
 *
 * The two auth cases must stay distinct all the way to the screen. They read
 * almost the same to a developer and mean opposite things to the person
 * holding the phone: one of them should go and sign in, the other should wait
 * thirty seconds and press the button again.
 */
export function describePrintError(e: unknown): Omit<PrintFailure, 'ok' | 'status'> {
  if (isSessionExpired(e)) {
    return {
      errorClass: 'SessionExpiredError',
      message: (e as Error).message || 'Your session has expired. Please sign in again.',
      needsLogin: true,
    };
  }
  if (isAuthServiceUnavailable(e)) {
    return {
      errorClass: 'AuthServiceUnavailableError',
      message:
        (e as Error).message ||
        'We could not reach the sign-in service. Your login is fine — please try again in a moment.',
      needsLogin: false,
    };
  }
  return {
    errorClass: 'NetworkError',
    message: 'Could not reach the server. Check your connection.',
    needsLogin: false,
  };
}

/**
 * Fetch a PDF for printing. Returns the blob, or a described failure — it does
 * not throw, because a print button has nothing useful to do with an exception
 * that a plain sentence cannot do better.
 *
 * Every failure is reported to /api/log-error before it returns. The report
 * carries endpoint, status, role and error class, and never the token.
 */
export async function fetchPrintPdf(
  endpoint: string,
  opts: { surface: string; role?: string | null } = { surface: 'unknown' }
): Promise<PrintResult> {
  const role = opts.role ?? getCurrentUser()?.role ?? null;

  const report = (errorClass: PrintErrorClass, status: number | null, message: string) =>
    reportClientFailure({
      type: 'print_failure',
      endpoint,
      status,
      errorClass,
      message,
      role,
      surface: opts.surface,
    });

  try {
    const res = await authedFetch(endpoint, { cache: 'no-store' });

    if (!res.ok) {
      // The server said something specific (job missing, PDF render failed).
      // Prefer its words — they are the ones that identify the real problem.
      let message = 'Could not generate the ticket.';
      try {
        message = (await res.json())?.error || message;
      } catch {
        /* not json — keep the default */
      }
      report('HttpError', res.status, message);
      return { ok: false, errorClass: 'HttpError', status: res.status, message, needsLogin: false };
    }

    return { ok: true, blob: await res.blob() };
  } catch (e) {
    const described = describePrintError(e);
    report(described.errorClass, null, described.message);
    return { ok: false, status: null, ...described };
  }
}

/**
 * Open a fetched PDF in a new tab. Returns null on success, or the sentence to
 * show when the browser blocked the popup — which looks identical to a failed
 * print if nobody says anything.
 */
export function openPrintBlob(blob: Blob): string | null {
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  // Revoke late so the new tab has finished loading the blob.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  if (!win) return 'Your browser blocked the popup. Allow popups for this site, then press Print again.';
  return null;
}
