export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getStripe } from '@/lib/stripe';

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;

  try {
    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .select('stripe_customer_id')
      .eq('id', auth.tenantId)
      .single();

    if (tenantError || !tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const stripeCustomerId = tenant.stripe_customer_id as string | null;

    if (!stripeCustomerId) {
      return NextResponse.json(
        { error: 'No Stripe customer linked. Please subscribe to a plan first.' },
        { status: 400 }
      );
    }

    const origin = request.headers.get('origin') || 'http://localhost:3000';
    const stripe = getStripe();

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${origin}/dashboard/admin/subscription`,
    });

    return NextResponse.json({ success: true, data: { url: portalSession.url } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
