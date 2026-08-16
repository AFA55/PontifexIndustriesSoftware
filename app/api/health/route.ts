// No auth required — public endpoint for uptime monitoring (UptimeRobot, Vercel, etc.)
export const dynamic = 'force-dynamic';
// Deliberately short. Every check inside is deadlined at 3s and they run in
// parallel, so this route should answer in ~3s worst case. If it ever hits this
// limit, something is wrong with the route itself, not with a dependency.
export const maxDuration = 15;

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { timedCheck, overallStatus, httpStatusFor, type CheckResult } from '@/lib/health-check';

/**
 * GET /api/health — is the platform actually serving?
 *
 * REWRITTEN Aug 16, during a live Supabase degradation that this endpoint could
 * not report. It ran three checks IN SERIES with no timeout on any of them;
 * each hung for roughly 25 seconds, so the route took over a minute and died at
 * the gateway. Measured: 46 of 46 requests returned 504 in fifteen minutes,
 * and it never once managed to say "degraded" — the single thing it exists for.
 *
 * A health check that goes down with the thing it is checking is not a health
 * check. Now every dependency is deadlined, they run in parallel, and the route
 * always answers — because the moment someone is reading this page is exactly
 * the moment it must not hang.
 *
 * Response: { status: 'healthy'|'degraded'|'down', checks, ... }
 * HTTP 503 only when something is genuinely down; a slow-but-serving platform
 * returns 200 with the detail in the body, so an uptime monitor does not page
 * anyone over latency.
 */
export async function GET() {
  const start = Date.now();

  const [database, auth, storage] = await Promise.all([
    // Promise.resolve(...) because a PostgREST query builder is thenable but
    // not a real Promise — Promise.race would accept it, but the type (and the
    // .catch semantics timedCheck relies on) would not hold.
    timedCheck(() => Promise.resolve(supabaseAdmin.from('profiles').select('id').limit(1))),
    // `listUsers` is the cheapest call that proves the AUTH service specifically
    // is answering — which is the dependency that, when it fails, tells every
    // user their session expired. Worth checking separately from the database.
    timedCheck(() => supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 })),
    timedCheck(() => supabaseAdmin.storage.listBuckets()),
  ]);

  const checks: Record<string, CheckResult> = { database, auth, storage };
  const status = overallStatus(checks);

  return NextResponse.json(
    {
      status,
      timestamp: new Date().toISOString(),
      total_latency_ms: Date.now() - start,
      version: process.env.NEXT_PUBLIC_APP_VERSION || '0.1.0',
      environment: process.env.NODE_ENV || 'production',
      uptime_since: process.env.VERCEL_DEPLOYMENT_ID
        ? `Vercel deployment: ${process.env.VERCEL_DEPLOYMENT_ID}`
        : 'local/unknown',
      checks,
    },
    { status: httpStatusFor(status) }
  );
}
