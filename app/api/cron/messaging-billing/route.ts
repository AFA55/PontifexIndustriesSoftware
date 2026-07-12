export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * GET /api/cron/messaging-billing — monthly usage billing (Phase 3,
 * docs/plans/MESSAGING_BILLING_PLAN.md + FINISH_LINE_PHASES.md).
 *
 * Runs on the 1st of each month: for every tenant, rolls up UNINVOICED
 * message_usage rows from BEFORE this month and charges the tenant's
 * card-on-file (the SAME Stripe customer/payment method the job-board
 * billing uses — hiring_billing). $1 minimum; tenants without a card are
 * skipped and logged, their usage stays uninvoiced for a later run.
 *
 * MONEY CODE — mirrors lib/hiring/settle.ts's proven invariants:
 *   1. Snapshot the exact row ids being billed.
 *   2. CAS-claim those rows (invoiced=false → true) BEFORE charging; only
 *      rows actually claimed are billed, so a concurrent run can never
 *      double-bill a row.
 *   3. Audit record BEFORE money moves (idempotency key on it).
 *   4. PaymentIntent with a per-attempt idempotency key.
 *   5. Card DECLINE → un-claim the rows (they bill next run) + audit.
 *      UNKNOWN outcome (network/Stripe 5xx) → KEEP the claim + audit for
 *      manual reconciliation — retrying an unknown is how people get
 *      double-charged.
 *
 * Auth: Bearer CRON_SECRET (fail-closed).
 */
import { createHash, randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getStripe } from '@/lib/stripe';

const MIN_CHARGE_USD = 1;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: 'Not configured' }, { status: 503 });
  const authHeader = request.headers.get('authorization') || '';
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const billingMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

  const results: Array<Record<string, unknown>> = [];

  // Tenants with any uninvoiced usage older than this month.
  const { data: pending, error: pendingError } = await supabaseAdmin
    .from('message_usage')
    .select('tenant_id')
    .eq('invoiced', false)
    .lt('created_at', monthStart)
    .limit(20000);
  if (pendingError) {
    return NextResponse.json({ error: pendingError.message }, { status: 500 });
  }
  const tenantIds = [...new Set((pending ?? []).map((r: any) => r.tenant_id as string))];

  for (const tenantId of tenantIds) {
    try {
      // 1. Snapshot the exact rows to bill.
      const { data: rows, error: rowsError } = await supabaseAdmin
        .from('message_usage')
        .select('id, billed_amount')
        .eq('tenant_id', tenantId)
        .eq('invoiced', false)
        .lt('created_at', monthStart);
      if (rowsError) throw new Error(rowsError.message);
      const ids = (rows ?? []).map((r: any) => r.id as string).sort();
      const amountById = new Map((rows ?? []).map((r: any) => [r.id as string, Number(r.billed_amount ?? 0)]));
      const total = ids.reduce((s, id) => s + (amountById.get(id) ?? 0), 0);
      if (total < MIN_CHARGE_USD) {
        results.push({ tenantId, skipped: 'below_minimum', total: Math.round(total * 100) / 100 });
        continue;
      }

      // Card on file (shared with job-board billing).
      const { data: billing } = await supabaseAdmin
        .from('hiring_billing')
        .select('stripe_customer_id, default_payment_method')
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (!billing?.stripe_customer_id || !billing?.default_payment_method) {
        results.push({ tenantId, skipped: 'no_card_on_file', total });
        Promise.resolve(
          supabaseAdmin.from('audit_logs').insert({
            action: 'messaging_billing_skipped_no_card',
            entity_type: 'tenant',
            entity_id: tenantId,
            details: { billing_month: billingMonth, total },
          })
        ).then(() => {}).catch(() => {});
        continue;
      }

      // 2. CAS-claim the snapshot rows. Only rows still uninvoiced are
      // claimed — a racing run loses cleanly.
      const { data: claimedRows, error: claimError } = await supabaseAdmin
        .from('message_usage')
        .update({ invoiced: true })
        .in('id', ids)
        .eq('tenant_id', tenantId) // defense-in-depth: ids are already tenant-scoped
        .eq('invoiced', false)
        .select('id');
      if (claimError) throw new Error(claimError.message);
      const claimedIds = (claimedRows ?? []).map((r: any) => r.id as string);
      const claimedTotal = claimedIds.reduce((s, id) => s + (amountById.get(id) ?? 0), 0);
      if (claimedIds.length === 0 || claimedTotal < MIN_CHARGE_USD) {
        // Lost the race (or race left us under the minimum) — release and move on.
        if (claimedIds.length > 0) {
          await supabaseAdmin.from('message_usage').update({ invoiced: false }).in('id', claimedIds).eq('tenant_id', tenantId);
        }
        results.push({ tenantId, skipped: 'claim_race', total });
        continue;
      }

      const snapshotHash = createHash('sha256').update(claimedIds.join(',')).digest('hex').slice(0, 40);
      const idempotencyKey = `msgbill-${tenantId}-${billingMonth}-${snapshotHash}-${randomUUID()}`;
      const amountCents = Math.round(claimedTotal * 100);

      // 3. Audit BEFORE money moves — a claim with no record is never OK.
      const { error: auditError } = await supabaseAdmin.from('audit_logs').insert({
        action: 'messaging_billing_claimed',
        entity_type: 'tenant',
        entity_id: tenantId,
        details: {
          billing_month: billingMonth,
          amount: claimedTotal,
          row_count: claimedIds.length,
          idempotency_key: idempotencyKey,
        },
      });
      if (auditError) {
        await supabaseAdmin.from('message_usage').update({ invoiced: false }).in('id', claimedIds).eq('tenant_id', tenantId);
        results.push({ tenantId, error: `audit failed, rolled back: ${auditError.message}` });
        continue;
      }

      // 4. Charge.
      const stripe = getStripe();
      try {
        const paymentIntent = await stripe.paymentIntents.create(
          {
            amount: amountCents,
            currency: 'usd',
            customer: billing.stripe_customer_id,
            payment_method: billing.default_payment_method,
            off_session: true,
            confirm: true,
            description: `Pontifex Industries — messaging usage (${billingMonth})`,
            metadata: { tenant_id: tenantId, module: 'messaging', billing_month: billingMonth },
          },
          { idempotencyKey }
        );
        Promise.resolve(
          supabaseAdmin.from('audit_logs').insert({
            action: 'messaging_billing_charged',
            entity_type: 'tenant',
            entity_id: tenantId,
            details: {
              billing_month: billingMonth,
              amount: claimedTotal,
              row_count: claimedIds.length,
              payment_intent: paymentIntent.id,
              idempotency_key: idempotencyKey,
            },
          })
        ).then(() => {}).catch(() => {});
        results.push({ tenantId, charged: claimedTotal, rows: claimedIds.length, paymentIntent: paymentIntent.id });
      } catch (err) {
        const stripeErr = err as { type?: string; name?: string; message?: string };
        const errType = stripeErr?.type || stripeErr?.name || '';
        if (errType === 'StripeConnectionError' || errType === 'StripeAPIError') {
          // 5b. UNKNOWN outcome: KEEP the claim; reconcile manually.
          await supabaseAdmin.from('audit_logs').insert({
            action: 'messaging_billing_pending_reconcile',
            entity_type: 'tenant',
            entity_id: tenantId,
            details: {
              billing_month: billingMonth,
              amount: claimedTotal,
              idempotency_key: idempotencyKey,
              error_type: errType,
              error_message: stripeErr?.message ?? null,
            },
          });
          results.push({ tenantId, pendingReconcile: claimedTotal, error: errType });
        } else {
          // 5a. Clean decline: release the rows to bill next run.
          await supabaseAdmin.from('message_usage').update({ invoiced: false }).in('id', claimedIds).eq('tenant_id', tenantId);
          await supabaseAdmin.from('audit_logs').insert({
            action: 'messaging_billing_declined',
            entity_type: 'tenant',
            entity_id: tenantId,
            details: {
              billing_month: billingMonth,
              amount: claimedTotal,
              idempotency_key: idempotencyKey,
              error_message: stripeErr?.message ?? null,
            },
          });
          results.push({ tenantId, declined: claimedTotal, error: stripeErr?.message ?? 'declined' });
        }
      }
    } catch (err) {
      results.push({ tenantId, error: err instanceof Error ? err.message : 'unknown' });
    }
  }

  return NextResponse.json({ success: true, billingMonth, tenants: results });
}
