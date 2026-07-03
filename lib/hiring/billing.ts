/**
 * Hiring module — billing helpers (Hireline-style ad-spend passthrough).
 * Plan: docs/plans/HIRELINE_MODULE_PLAN.md §5
 *
 * Model: we pay the ad platforms raw cost, bill the tenant raw × markup
 * (default 1.5), and charge the saved card on the 1st of the month / when the
 * balance reaches an escalating threshold / when all jobs pause — whichever
 * comes first. The customer NEVER sees raw cost or the markup, only billed.
 *
 * SERVER-ONLY except the pure math helpers — ensureBillingRow touches
 * supabaseAdmin. Client code should read threshold/balance from the API.
 */

import { supabaseAdmin } from '@/lib/supabase-admin';
import type { HiringBilling } from '@/lib/hiring/types';

/** Threshold escalation (mirrors Hireline): $25 default → $50 at $100+ lifetime → $250 at $500+. */
export function computeThreshold(lifetimeBilled: number): 25 | 50 | 250 {
  if (lifetimeBilled >= 500) return 250;
  if (lifetimeBilled >= 100) return 50;
  return 25;
}

/** Round to cents — all money math in this module goes through here. */
export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** What we bill the tenant for a raw ad-platform cost. */
export function billAmount(rawCost: number, markup: number): number {
  return roundMoney(rawCost * markup);
}

/**
 * True when Stripe is usable at runtime. Every billing route that touches
 * Stripe must check this first and 503 with { error: 'Billing not configured' }
 * instead of letting getStripe() throw. (Matches the guard inside lib/stripe.ts.)
 */
export function isStripeConfigured(): boolean {
  const key = process.env.STRIPE_SECRET_KEY;
  return !!key && !key.startsWith('sk_test_REPLACE');
}

/**
 * Fetch the tenant's hiring_billing row, inserting the default row
 * (threshold 25, markup 1.5 — DB defaults) if it doesn't exist yet.
 * Safe under concurrent calls: falls back to a re-read on insert conflict.
 */
export async function ensureBillingRow(tenantId: string): Promise<HiringBilling> {
  const { data: existing } = await supabaseAdmin
    .from('hiring_billing')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (existing) return existing as HiringBilling;

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('hiring_billing')
    .insert({ tenant_id: tenantId })
    .select('*')
    .single();

  if (!insertError && inserted) return inserted as HiringBilling;

  // Insert raced with another request (unique tenant_id PK) — re-read.
  const { data: again, error: readError } = await supabaseAdmin
    .from('hiring_billing')
    .select('*')
    .eq('tenant_id', tenantId)
    .single();
  if (readError || !again) {
    throw new Error(`Could not ensure hiring_billing row for tenant ${tenantId}: ${insertError?.message || readError?.message}`);
  }
  return again as HiringBilling;
}
