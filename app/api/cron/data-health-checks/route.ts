export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/data-health-checks
 *
 * Distinct from /api/cron/health-check (singular) — that route is infra/DB
 * uptime monitoring (connectivity, size, table counts -> system_health_log).
 * This route checks business DATA health (stuck jobs, overdue invoices,
 * inactive tenants -> platform_health_alerts). Different concern, different
 * table — kept the name clearly distinct to avoid confusing the two.
 *
 * Vercel Cron job — runs the platform health-check suite (lib/platform-health-checks.ts)
 * daily and reconciles results into `platform_health_alerts`. Protected by
 * CRON_SECRET, same convention as every other route in app/api/cron/.
 *
 * Every check is read-only against tenant data (job_orders, invoices, timecards,
 * tenants) — the ONLY write in this route is to platform_health_alerts via
 * reconcileAlerts(). See lib/platform-health-checks.ts for the check logic.
 *
 * Returns: { success, results: [{ checkType, ran, candidates, inserted, resolved, skippedReason? }] }
 */
import { NextRequest, NextResponse } from 'next/server';
import { HEALTH_CHECKS, reconcileAlerts } from '@/lib/platform-health-checks';

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization') || '';

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results = [];

  for (const check of HEALTH_CHECKS) {
    const result = await check();
    const { inserted, resolved } = await reconcileAlerts(result);
    results.push({
      checkType: result.checkType,
      ran: result.ran,
      candidateCount: result.candidates.length,
      inserted,
      resolved,
      skippedReason: result.skippedReason,
    });
  }

  return NextResponse.json({ success: true, results });
}
