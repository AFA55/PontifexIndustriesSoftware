export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

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

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: true }); // Always return 200 — error logging should never fail
  }
}
