import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

// No auth required — public endpoint for uptime monitoring (UptimeRobot, Vercel, etc.)
export const dynamic = 'force-dynamic';

/**
 * GET /api/health — System health check endpoint.
 * Returns status of core services. No auth required.
 * Response: { status: 'ok'|'degraded'|'down', checks, timestamp, version, environment }
 */
export async function GET() {
  const start = Date.now();
  const checks: Record<string, { status: 'ok' | 'degraded' | 'down'; latency_ms?: number; error?: string }> = {};

  // 1. Database check
  try {
    const dbStart = Date.now();
    const { error } = await supabaseAdmin.from('profiles').select('id').limit(1);
    const dbLatency = Date.now() - dbStart;
    checks.database = error
      ? { status: 'down', latency_ms: dbLatency, error: error.message }
      : { status: dbLatency > 2000 ? 'degraded' : 'ok', latency_ms: dbLatency };
  } catch (err: any) {
    checks.database = { status: 'down', error: err.message };
  }

  // 2. Auth check
  try {
    const authStart = Date.now();
    // Just check if the auth service responds
    const { error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 });
    const authLatency = Date.now() - authStart;
    checks.auth = error
      ? { status: 'down', latency_ms: authLatency, error: error.message }
      : { status: authLatency > 2000 ? 'degraded' : 'ok', latency_ms: authLatency };
  } catch (err: any) {
    checks.auth = { status: 'down', error: err.message };
  }

  // 3. Storage check
  try {
    const storageStart = Date.now();
    const { error } = await supabaseAdmin.storage.listBuckets();
    const storageLatency = Date.now() - storageStart;
    checks.storage = error
      ? { status: 'down', latency_ms: storageLatency, error: error.message }
      : { status: storageLatency > 3000 ? 'degraded' : 'ok', latency_ms: storageLatency };
  } catch (err: any) {
    checks.storage = { status: 'down', error: err.message };
  }

  const totalLatency = Date.now() - start;
  const allOk = Object.values(checks).every(c => c.status === 'ok');
  const anyDown = Object.values(checks).some(c => c.status === 'down');

  const overallStatus = anyDown ? 'down' : allOk ? 'healthy' : 'degraded';

  return NextResponse.json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    total_latency_ms: totalLatency,
    version: process.env.NEXT_PUBLIC_APP_VERSION || '0.1.0',
    environment: process.env.NODE_ENV || 'production',
    uptime_since: process.env.VERCEL_DEPLOYMENT_ID
      ? `Vercel deployment: ${process.env.VERCEL_DEPLOYMENT_ID}`
      : 'local/unknown',
    checks,
  }, {
    status: anyDown ? 503 : 200,
  });
}
