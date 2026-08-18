export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/workflow-health
 *
 * The screen behind the alerts. The founder should never have to wait for a
 * Telegram message to find out where the workflow stands — and more to the
 * point, when a message DOES arrive he needs somewhere to go and look.
 *
 * Measures LIVE on every request rather than serving the last cron row. Two
 * reasons: the numbers are then never stale by up to a day, and — more
 * importantly — if a check is broken the screen says so RIGHT NOW, in the same
 * words the alert would use, instead of showing yesterday's healthy figure and
 * quietly hiding the fault. The stored history is returned alongside, purely
 * for the trend.
 *
 * Reading is cheap: six small tenant-scoped selects.
 *
 * TENANT SCOPE. `tenantId` comes from the authenticated session, never the
 * request body. A super_admin may pass ?tenantId= to look at a specific tenant;
 * nobody else can, and requireAdmin has already established the role.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { createSupabaseHealthDataSource } from '@/lib/workflow-health/data-source';
import { alertingStatus, loadHistory, measureTenant } from '@/lib/workflow-health/service';
import { displayValue, trendClause } from '@/lib/workflow-health/runner';

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;

  const requested = request.nextUrl.searchParams.get('tenantId');
  const tenantId = auth.role === 'super_admin' && requested ? requested : auth.tenantId;

  if (!tenantId) {
    return NextResponse.json(
      { error: 'No tenant on this account. Pass ?tenantId= as super_admin.' },
      { status: 400 }
    );
  }

  try {
    const { data: tenantRow, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .select('id, name, timezone')
      .eq('id', tenantId)
      .maybeSingle();
    if (tenantError) throw new Error(`reading tenant: ${tenantError.message}`);
    if (!tenantRow) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const nowMs = Date.now();
    const history = await loadHistory(tenantId);
    const report = await measureTenant(
      tenantRow as { id: string; name: string; timezone: string | null },
      createSupabaseHealthDataSource(),
      history,
      nowMs
    );
    const alerting = await alertingStatus(tenantId);

    return NextResponse.json({
      success: true,
      data: {
        tenantName: report.tenantName,
        measuredAt: report.measuredAt,
        // Whether an alert can actually LEAVE, and when one last did. Without
        // this the screen cannot tell "quiet because healthy" from "quiet
        // because the token is missing" — and neither can the founder.
        alerting: {
          configured: alerting.configured,
          lastDeliveredAt: alerting.lastDeliveredAt,
          lookupFailed: alerting.lookupFailed,
        },
        // The trend on every card is missing when this is false, and the cards
        // say so rather than silently showing a first-measurement dash.
        historyAvailable: history !== null,
        metrics: report.results.map((r) => ({
          key: r.key,
          label: r.label,
          why: r.why,
          unit: r.unit,
          direction: r.direction,
          threshold: r.threshold,
          status: r.status,
          value: r.value,
          numerator: r.numerator,
          denominator: r.denominator,
          unknownReason: r.unknownReason,
          error: r.error,
          // Pre-rendered on the server so the phone shows the SAME words the
          // Telegram message used. Two renderings of one number drift, and a
          // dashboard that disagrees with its own alert is worse than neither.
          sentence: r.sentence,
          display: displayValue(r),
          trend: r.trend,
          trendText: trendClause(r, nowMs).replace(/^, /, ''),
          action: r.action,
          href: r.href,
          history: (history?.get(r.key) ?? [])
            .filter((h) => h.value !== null)
            .slice(0, 30)
            .map((h) => ({ value: h.value, measuredAt: h.measured_at, status: h.status }))
            .reverse(),
        })),
      },
    });
  } catch (error) {
    // An outright failure here must READ as a failure, not as an empty page.
    console.error('[workflow-health] admin read failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
