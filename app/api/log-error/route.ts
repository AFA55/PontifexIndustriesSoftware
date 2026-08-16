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

    const errorLog = {
      type: body.type || 'client_error',
      error_message: (body.error || body.message || 'Unknown error').slice(0, 2000),
      stack_trace: (body.stack || '').slice(0, 5000),
      component_stack: (body.componentStack || '').slice(0, 5000),
      url: (body.url || '').slice(0, 500),
      user_agent: (body.userAgent || request.headers.get('user-agent') || '').slice(0, 500),
      metadata: {
        timestamp: body.timestamp || new Date().toISOString(),
        extra: body.extra || null,
      },
      created_at: new Date().toISOString(),
    };

    // Fire-and-forget — insert into error_logs table if it exists
    Promise.resolve(
      supabaseAdmin
        .from('error_logs')
        .insert(errorLog)
    ).then(({ error }) => {
      if (error) {
        // Table might not exist yet — just log to console
        console.error('[log-error] DB insert failed:', error.message);
      }
    }).catch(() => {});

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
    // Fire-and-forget with its own dedupe. An alerting call must never delay or
    // fail the error report it is riding on.
    const fingerprint = alertFingerprint({
      level: 'error',
      title: errorLog.error_message.slice(0, 120),
      source: errorLog.url,
    });
    if (shouldAlert(fingerprint)) {
      void alert({
        level: 'error',
        title: 'App crashed for a user',
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
