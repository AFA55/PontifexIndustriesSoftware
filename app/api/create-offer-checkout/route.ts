export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { email?: string };
    const { email } = body;

    const stripe = getStripe();
    const origin = request.headers.get('origin') || 'https://pontifexindustries.com';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Pontifex Platform — 30-Day Trial',
              description: 'Full platform access for Patriot Concrete Cutting. 100% money-back guarantee if it doesn\'t work for you.',
            },
            unit_amount: 160000, // $1,600.00 in cents
          },
          quantity: 1,
        },
      ],
      customer_email: email || undefined,
      success_url: `${origin}/offer/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/offer`,
      metadata: {
        type: 'trial_offer',
        client: 'patriot_concrete_cutting',
      },
      payment_intent_data: {
        metadata: {
          type: 'trial_offer',
          client: 'patriot_concrete_cutting',
        },
      },
    });

    return NextResponse.json({ success: true, data: { url: session.url } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
