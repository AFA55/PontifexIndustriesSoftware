export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/workflow-health
 *
 * THE LOOP THE FOUNDER ASKED FOR (Aug 17): "Is there a loop function we can
 * create to know when parts of workflow is failing or not working properly?"
 *
 * Every morning: measure each tenant's workflow metrics, compare each to a week
 * ago, and send ONE Telegram message per tenant — but only when something
 * changed. On an ordinary day where nothing broke and nothing got fixed, this
 * route runs, writes its history rows, and says nothing at all. Monday gets a
 * short routine summary so that silence stays legible.
 *
 * This is distinct from the two health crons that already exist and should not
 * be merged with either:
 *   /api/cron/health-check       infrastructure — is the database answering?
 *   /api/cron/data-health-checks stuck records — is THIS job/invoice overdue?
 *   /api/cron/workflow-health    (this) — is the PROCESS working? are jobs
 *                                getting signed, closed, costed and staffed?
 *
 * The first two ask about rows. This one asks about the funnel, which is what
 * nobody could see: every leak found on Aug 17 was found by a human running
 * SQL by hand.
 *
 * SCHEDULE: `30 12 * * *`, which is 12:30 UTC. Vercel crons have no timezone,
 * so that is 8:30 AM Eastern from March to November and 7:30 AM for the rest of
 * the year — it is NOT "8:30 AM ET" year-round, and the comment says so rather
 * than quietly drifting an hour every autumn. Both times land before the crew
 * is dispatched, which is the only property that actually matters here.
 *
 * DRY RUN: ?dryRun=1 measures and builds the message but sends nothing and
 * returns the body, so the channel can be exercised without firing a real alert
 * at the founder. Still requires CRON_SECRET.
 *
 * NON-200 WHEN NOTHING COULD BE DELIVERED. If every message this run tried to
 * send was refused, the route fails with a 500 so the failure shows up in
 * Vercel's cron log instead of only in a JSON field nobody reads. A monitor
 * that cannot deliver is itself an outage.
 *
 * Authorization: Bearer ${CRON_SECRET}  (fail-closed if the env var is unset)
 * Returns: { success, tenants: [{ tenantId, reported, messageSent, ... }] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseHealthDataSource } from '@/lib/workflow-health/data-source';
import {
  deliverReport,
  listTenants,
  loadHistory,
  measureTenant,
} from '@/lib/workflow-health/service';

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 });
  }
  if ((request.headers.get('authorization') || '') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dryRun = request.nextUrl.searchParams.get('dryRun') === '1';
  const forceWeekly = request.nextUrl.searchParams.get('forceWeekly') === '1';
  const source = createSupabaseHealthDataSource();
  const outcomes: Array<Record<string, unknown>> = [];
  const previews: Record<string, string> = {};

  try {
    const tenants = await listTenants();

    for (const tenant of tenants) {
      // Per-tenant isolation: one tenant's bad data must never stop another
      // tenant being measured. Same shape as the clock-out cron's per-tenant
      // try/catch, and the reason that one survives a single bad row.
      try {
        const history = await loadHistory(tenant.id);
        const report = await measureTenant(tenant, source, history);
        const outcome = await deliverReport(report, history, {
          forceWeeklySummary: forceWeekly || undefined,
          sendFn: dryRun
            ? async (text: string) => {
                previews[tenant.name] = text;
                return false; // NOT sent — so alerted_at is not stamped either.
              }
            : undefined,
          // A dry run declines on purpose. Saying "transport declined" for it
          // reads like a broken channel, and the two must stay distinguishable.
          declineReason: dryRun ? 'not sent — dry run' : undefined,
        });
        outcomes.push({
          ...outcome,
          tenantName: tenant.name,
          metrics: report.results.map((r) => ({
            key: r.key,
            status: r.status,
            value: r.value,
            unknownReason: r.unknownReason,
            trend: r.trend,
          })),
        });
      } catch (e) {
        // Recorded in the response rather than swallowed — a tenant that cannot
        // be measured at all is itself a finding.
        console.error(`[workflow-health] tenant ${tenant.id} failed:`, e);
        outcomes.push({
          tenantId: tenant.id,
          tenantName: tenant.name,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    // Every message this run tried to send was refused → the channel is down,
    // and that must be visible where cron failures are visible, not buried in
    // a `sendError` string. Dry runs decline by design and never count.
    const attempted = outcomes.filter((o) => o.messageAttempted === true);
    const deliveryFailed =
      !dryRun && attempted.length > 0 && attempted.every((o) => o.messageSent !== true);

    return NextResponse.json(
      {
        success: !deliveryFailed,
        dryRun,
        ...(deliveryFailed
          ? {
              error:
                'Workflow health measured, but NO alert could be delivered — check TELEGRAM_BOT_TOKEN / TELEGRAM_ALERT_CHAT_ID.',
            }
          : {}),
        tenants: outcomes,
        ...(dryRun ? { previews } : {}),
      },
      { status: deliveryFailed ? 500 : 200 }
    );
  } catch (error) {
    console.error('[workflow-health] run failed:', error);
    return NextResponse.json(
      { success: false, error: String(error), tenants: outcomes },
      { status: 500 }
    );
  }
}
