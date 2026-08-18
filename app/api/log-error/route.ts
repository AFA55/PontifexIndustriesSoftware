export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { alert, alertFingerprint } from '@/lib/telegram';

/**
 * Per-instance flood guard. One browser stuck in a render loop can post the
 * same crash hundreds of times a minute, and a channel that floods gets muted —
 * at which point it is no better than the hub the founder already does not
 * check. Per-instance is imperfect across serverless workers, but it turns
 * "hundreds" into "a handful", which is the difference that matters.
 */
const ALERT_WINDOW_MS = 15 * 60 * 1000;
const recentAlerts = new Map<string, number>();

function shouldAlert(fingerprint: string, now = Date.now()): boolean {
  const last = recentAlerts.get(fingerprint);
  if (last && now - last < ALERT_WINDOW_MS) return false;
  recentAlerts.set(fingerprint, now);
  // Bound the map so a long-lived instance seeing many distinct errors cannot
  // grow it without limit.
  if (recentAlerts.size > 500) {
    for (const [k, t] of recentAlerts) {
      if (now - t >= ALERT_WINDOW_MS) recentAlerts.delete(k);
    }
  }
  return true;
}

/**
 * POST /api/log-error — Client-side error logging endpoint.
 * Stores crashes and errors for the system health dashboard.
 * No auth required (errors can happen before/during auth).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const reportedUrl = (body.url || '').slice(0, 500);

    const errorLog = {
      type: body.type || 'client_error',
      // `endpoint` and `method` are NOT NULL with no default — the table was
      // designed for API errors and later reused for browser crashes without
      // anyone supplying them. Every single insert this route has ever
      // attempted was rejected with:
      //     null value in column "endpoint" violates not-null constraint
      // caught by the .then() below, printed to a console nobody reads, and the
      // route still returned 200. So the endpoint built to capture crashes has
      // never stored one.
      //
      // For a browser crash the "endpoint" is the page the user was on, which
      // is the genuinely useful thing to record.
      endpoint: (reportedUrl || 'unknown').slice(0, 500),
      method: 'CLIENT',
      error_message: (body.error || body.message || 'Unknown error').slice(0, 2000),
      stack_trace: (body.stack || '').slice(0, 5000),
      component_stack: (body.componentStack || '').slice(0, 5000),
      url: reportedUrl,
      user_agent: (body.userAgent || request.headers.get('user-agent') || '').slice(0, 500),
      // `status_code` and `user_role` are REAL COLUMNS on this table (it was
      // built for API errors first). Reporters that carry them should fill them
      // in rather than bury them in jsonb: the question actually asked after an
      // incident is "what failed for the office admin last Tuesday", and that
      // should be a WHERE clause, not a jsonb dig. Both are nullable, so a
      // reporter that has neither is unaffected.
      status_code: typeof body.extra?.status === 'number' ? body.extra.status : null,
      user_role: typeof body.extra?.role === 'string' ? body.extra.role.slice(0, 50) : null,
      metadata: {
        timestamp: body.timestamp || new Date().toISOString(),
        extra: body.extra || null,
      },
      created_at: new Date().toISOString(),
    };

    // AWAITED, not fire-and-forget. This runs in a serverless function: once the
    // response is returned the runtime may freeze the instance, and any promise
    // still in flight is simply killed. A write that "usually" lands is not a
    // record. It stays inside the try/catch, so a failure still cannot turn an
    // error report into a second error.
    const { error: insertError } = await supabaseAdmin.from('error_logs').insert(errorLog);
    if (insertError) {
      console.error('[log-error] DB insert failed:', insertError.message);
    }

    // Also log to server console
    console.error(`[CLIENT_ERROR] ${errorLog.type}: ${errorLog.error_message} @ ${errorLog.url}`);

    // ── MAKE "OUR TEAM HAS BEEN NOTIFIED" TRUE ──────────────────────────────
    //
    // Every crash screen in this app tells the operator "our team has been
    // notified". Nobody was: 0 of 60 error boundaries reported anywhere, and
    // this endpoint — which exists to receive exactly this — had no callers.
    // Meanwhile a feature stayed broken for two months and a twelve-day failure
    // went unseen.
    //
    // AWAITED, and this is the whole reason the first three test alerts never
    // arrived. It was `void alert(...)` — fire-and-forget — and the Vercel log
    // showed exactly what that costs:
    //
    //     [telegram] send error This operation was aborted
    //
    // The config was present and the send WAS attempted; the serverless instance
    // simply froze once the response was returned, killing the in-flight fetch.
    // A fire-and-forget network call in a serverless function is a coin flip,
    // and an alert that arrives sometimes is worse than none — you stop
    // trusting the silence.
    //
    // `sendTelegram` carries its own 4s abort, so the worst this adds to an
    // error report is four seconds, and it can never throw.
    const fingerprint = alertFingerprint({
      level: 'error',
      title: errorLog.error_message.slice(0, 120),
      source: errorLog.url,
    });
    if (shouldAlert(fingerprint)) {
      await alert({
        level: 'error',
        // Not everything reported here is a crash. A print that failed is a
        // person blocked, not a white screen, and calling it a crash is how an
        // alert channel stops meaning anything.
        title: errorLog.type.startsWith('boundary:')
          ? 'App crashed for a user'
          : 'A user action failed',
        detail: errorLog.error_message.slice(0, 400),
        source: errorLog.url || errorLog.type,
        url: errorLog.url || undefined,
      });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: true }); // Always return 200 — error logging should never fail
  }
}
