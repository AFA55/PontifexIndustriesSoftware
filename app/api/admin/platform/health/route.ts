export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin, isTableNotFoundError } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/admin/platform/health — Platform Hub health snapshot (super_admin only).
 *
 * Returns:
 *  - recentErrors: last N rows from public.error_logs (graceful empty if the
 *    table doesn't exist — the app inserts into it via /api/log-error).
 *  - errorCount24h: number of errors in the last 24h (for the KPI tile).
 *  - errorLogsAvailable: whether the error_logs data source is wired.
 *  - sentry: { configured } — true when a Sentry DSN env var is present.
 *
 * NEVER fabricates uptime numbers — only reports what we can actually observe.
 */
export async function GET(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (!auth.authorized) return auth.response;

  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 8, 1), 50);

  // Sentry is wired in the codebase (@sentry/nextjs) but only sends when a DSN
  // is set. We can't see the client DSN server-side reliably, so check both.
  const sentryConfigured = Boolean(
    process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN
  );

  let errorLogsAvailable = true;
  let recentErrors: Array<{
    id: string;
    type: string;
    error_message: string;
    url: string | null;
    created_at: string;
  }> = [];
  let errorCount24h = 0;

  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [recentRes, countRes] = await Promise.all([
      supabaseAdmin
        .from('error_logs')
        .select('id, type, error_message, url, created_at')
        .order('created_at', { ascending: false })
        .limit(limit),
      supabaseAdmin
        .from('error_logs')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', since),
    ]);

    if (recentRes.error) {
      if (isTableNotFoundError(recentRes.error)) {
        errorLogsAvailable = false;
      } else {
        throw recentRes.error;
      }
    } else {
      recentErrors = recentRes.data || [];
    }

    if (!countRes.error) {
      errorCount24h = countRes.count || 0;
    } else if (isTableNotFoundError(countRes.error)) {
      errorLogsAvailable = false;
    }
  } catch (err: any) {
    // Non-fatal: the Hub renders an empty/health state instead of breaking.
    return NextResponse.json({
      success: true,
      data: {
        errorLogsAvailable: false,
        recentErrors: [],
        errorCount24h: 0,
        sentry: { configured: sentryConfigured },
        note: err?.message || 'error_logs unavailable',
      },
    });
  }

  return NextResponse.json({
    success: true,
    data: {
      errorLogsAvailable,
      recentErrors,
      errorCount24h,
      sentry: { configured: sentryConfigured },
    },
  });
}
