export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;

  try {
    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .select(
        'subscription_status, subscription_plan, subscription_period_end, trial_ends_at, stripe_customer_id'
      )
      .eq('id', auth.tenantId)
      .single();

    if (tenantError || !tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // Count operators for this tenant
    const { count: operatorCount } = await supabaseAdmin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', auth.tenantId)
      .in('role', ['operator', 'apprentice']);

    return NextResponse.json({
      success: true,
      data: {
        status: (tenant.subscription_status as string) ?? 'trialing',
        plan: (tenant.subscription_plan as string) ?? 'starter',
        periodEnd: tenant.subscription_period_end as string | null,
        trialEndsAt: tenant.trial_ends_at as string | null,
        hasStripeCustomer: !!(tenant.stripe_customer_id as string | null),
        operatorCount: operatorCount ?? 0,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
