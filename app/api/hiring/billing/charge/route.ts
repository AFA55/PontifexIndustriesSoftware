export const dynamic = 'force-dynamic';

/**
 * POST /api/hiring/billing/charge — charge the tenant's saved card for
 * balance_owed. Allowed when balance_owed ≥ threshold, or with force=true
 * (super_admin only).
 *
 * The actual money path (CAS balance claim, awaited claim audit event,
 * per-attempt idempotency key, pending/decline/restore handling) lives in
 * lib/hiring/settle.ts — settleHiringBalance() — shared with the daily
 * billing cron (app/api/cron/hiring-billing). This route only does auth,
 * force validation, tenant resolution, and maps the SettleResult back to the
 * exact HTTP responses this endpoint has always returned. Guardian B1/B2
 * semantics are documented in the helper.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, resolveBillingTenant } from '@/lib/api-auth';
import { isStripeConfigured } from '@/lib/hiring/billing';
import { settleHiringBalance } from '@/lib/hiring/settle';

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;

  const body = (await request.json().catch(() => ({}))) as { force?: unknown };
  const force = body?.force === true;
  if (force && auth.role !== 'super_admin') {
    return NextResponse.json(
      { error: 'Forbidden. Only a super admin can force a charge below the threshold.' },
      { status: 403 }
    );
  }

  const scope = await resolveBillingTenant(request, auth);
  if ('response' in scope) return scope.response;
  const tenantId = scope.tenantId;

  if (!isStripeConfigured()) {
    return NextResponse.json({ error: 'Billing not configured' }, { status: 503 });
  }

  try {
    const result = await settleHiringBalance(tenantId, {
      trigger: 'manual',
      force,
      actorId: auth.userId,
    });

    switch (result.kind) {
      case 'charged':
        return NextResponse.json({
          success: true,
          data: {
            charged: result.amount,
            paymentIntentId: result.paymentIntentId,
            lifetimeBilled: result.lifetimeBilled,
            newThreshold: result.newThreshold,
          },
        });
      case 'pending':
        return NextResponse.json({
          success: true,
          data: {
            pending: true,
            ...(result.paymentIntentId ? { paymentIntentId: result.paymentIntentId } : {}),
            amount: result.amount,
            message: result.message,
          },
        });
      default:
        // skipped / conflict / declined / error — pre-composed message + status.
        return NextResponse.json({ error: result.error }, { status: result.httpStatus });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
