import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

// Must be dynamic — reads DB on every call
export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/health-check
 *
 * Vercel Cron job — runs daily at 06:00 UTC.
 * Protected by CRON_SECRET environment variable.
 *
 * 1. Checks DB connectivity
 * 2. Captures DB size + table counts
 * 3. Logs a snapshot to system_health_log
 * 4. Returns 200 if healthy, 500 if not
 */
export async function GET(request: NextRequest) {
  // Protect the endpoint — only Vercel Cron (or manual calls with the secret) allowed
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const checkedAt = new Date().toISOString();
  const checkResults: Record<string, { status: string; latency_ms?: number; error?: string }> = {};
  let overallStatus: 'ok' | 'degraded' | 'down' = 'ok';

  // ── 1. Database connectivity check ──────────────────────────────────────────
  try {
    const t0 = Date.now();
    const { error } = await supabaseAdmin.from('profiles').select('id').limit(1);
    const latency = Date.now() - t0;
    checkResults.database = error
      ? { status: 'down', latency_ms: latency, error: error.message }
      : { status: latency > 2000 ? 'degraded' : 'ok', latency_ms: latency };
  } catch (err: unknown) {
    checkResults.database = {
      status: 'down',
      error: err instanceof Error ? err.message : 'unknown error',
    };
  }

  // ── 2. DB size (pg_database_size) ───────────────────────────────────────────
  let dbSizeMb: number | null = null;
  try {
    const { data, error } = await supabaseAdmin.rpc('get_db_size_mb').single();
    if (!error && data !== null) dbSizeMb = data as number;
  } catch {
    // Non-fatal — function may not exist; size stays null
  }

  // ── 3. Table counts ─────────────────────────────────────────────────────────
  let tableCounts: Record<string, number> | null = null;
  try {
    const { data, error } = await supabaseAdmin
      .from('information_schema.tables' as 'profiles') // cast to bypass type narrowing
      .select('table_name')
      .eq('table_schema', 'public')
      .eq('table_type', 'BASE TABLE');
    if (!error && data) {
      tableCounts = { total_tables: (data as { table_name: string }[]).length };
    }
  } catch {
    // Non-fatal
  }

  // ── 4. Auth service ping ────────────────────────────────────────────────────
  try {
    const t0 = Date.now();
    const { error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 });
    const latency = Date.now() - t0;
    checkResults.auth = error
      ? { status: 'down', latency_ms: latency, error: error.message }
      : { status: latency > 2000 ? 'degraded' : 'ok', latency_ms: latency };
  } catch (err: unknown) {
    checkResults.auth = {
      status: 'down',
      error: err instanceof Error ? err.message : 'unknown error',
    };
  }

  // ── Determine overall status ─────────────────────────────────────────────────
  const anyDown = Object.values(checkResults).some(c => c.status === 'down');
  const anyDegraded = Object.values(checkResults).some(c => c.status === 'degraded');
  if (anyDown) overallStatus = 'down';
  else if (anyDegraded) overallStatus = 'degraded';

  // ── 5. Write snapshot to system_health_log ───────────────────────────────────
  // Fire-and-forget — don't let a write failure break the cron response
  Promise.resolve(
    supabaseAdmin.from('system_health_log').insert({
      checked_at: checkedAt,
      db_size_mb: dbSizeMb,
      table_counts: tableCounts,
      check_results: checkResults,
      overall_status: overallStatus,
      notes: `Automated daily cron. Vercel deployment: ${process.env.VERCEL_DEPLOYMENT_ID ?? 'unknown'}`,
    })
  ).catch(() => {});

  const httpStatus = overallStatus === 'down' ? 500 : 200;

  return NextResponse.json(
    {
      status: overallStatus,
      timestamp: checkedAt,
      checks: checkResults,
      db_size_mb: dbSizeMb,
      table_counts: tableCounts,
      version: process.env.NEXT_PUBLIC_APP_VERSION || '0.1.0',
      environment: process.env.NODE_ENV || 'production',
    },
    { status: httpStatus }
  );
}
