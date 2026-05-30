export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, resolveBillingTenant } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getStripe } from '@/lib/stripe';
import { PLANS, type PlanId } from '@/lib/billing-plans';

export async function POST(request: NextRequest) {
  // Billing is per-tenant: a tenant admin manages their own; super_admin can target any tenant.
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;

  const scope = await resolveBillingTenant(request, auth);
  if ('response' in scope) return scope.response;
  const tenantId = scope.tenantId;

  try {
    const body = await request.json() as { planId: string };
    const { planId } = body;

    if (!planId || !(planId in PLANS)) {
      return NextResponse.json({ error: 'Invalid plan ID' }, { status: 400 });
    }

    const plan = PLANS[planId as PlanId];
    if (!plan.priceId) {
      return NextResponse.json(
        { error: 'This plan is not available for self-serve checkout. Contact sales.' },
        { status: 400 }
      );
    }

    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .select('id, name, billing_email, stripe_customer_id')
      .eq('id', tenantId)
      .single();

    if (tenantError || !tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const stripe = getStripe();
    let stripeCustomerId = tenant.stripe_customer_id as string | null;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        name: tenant.name,
        email: (tenant.billing_email || auth.userEmail) ?? undefined,
        metadata: { tenant_id: tenantId },
      });
      stripeCustomerId = customer.id;
      await supabaseAdmin
        .from('tenants')
        .update({ stripe_customer_id: stripeCustomerId })
        .eq('id', tenantId);
    }

    const origin = request.headers.get('origin') || 'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: stripeCustomerId,
      line_items: [{ price: plan.priceId, quantity: 1 }],
      success_url: `${origin}/dashboard/admin/subscription?success=true`,
      cancel_url: `${origin}/dashboard/admin/subscription?canceled=true`,
      subscription_data: {
        trial_period_days: 14,
        metadata: { tenant_id: tenantId, plan: planId },
      },
      metadata: { tenant_id: tenantId, plan: planId },
      allow_promotion_codes: true,
    });

    return NextResponse.json({ success: true, data: { url: session.url } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
