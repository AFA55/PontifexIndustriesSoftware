export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, resolveBillingTenant } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;

  // Billing is per-tenant: tenant admin -> own tenant; super_admin -> ?tenantId or sole tenant.
  const scope = await resolveBillingTenant(request, auth);
  if ('response' in scope) return scope.response;
  const tenantId = scope.tenantId;

  try {
    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .select(
        'subscription_status, subscription_plan, subscription_period_end, trial_ends_at, stripe_customer_id'
      )
      .eq('id', tenantId)
      .single();

    if (tenantError || !tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // Count operators + the USAGE card (hiring_billing is where the
    // card-on-file for ad/SMS/usage charges actually lives — the tenants
    // stripe_customer_id is only the SaaS-subscription customer, so checking
    // it alone reports "no card" even after one was saved).
    const [{ count: operatorCount }, { data: usageBilling }] = await Promise.all([
      supabaseAdmin
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .in('role', ['operator', 'apprentice']),
      supabaseAdmin
        .from('hiring_billing')
        .select('stripe_customer_id, default_payment_method')
        .eq('tenant_id', tenantId)
        .maybeSingle(),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        status: (tenant.subscription_status as string) ?? 'trialing',
        plan: (tenant.subscription_plan as string) ?? 'starter',
        periodEnd: tenant.subscription_period_end as string | null,
        trialEndsAt: tenant.trial_ends_at as string | null,
        hasStripeCustomer:
          !!(tenant.stripe_customer_id as string | null) || !!usageBilling?.stripe_customer_id,
        hasUsageCard: !!usageBilling?.default_payment_method,
        operatorCount: operatorCount ?? 0,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
