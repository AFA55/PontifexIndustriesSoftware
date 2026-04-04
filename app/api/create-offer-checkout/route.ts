export const dynamic = 'force-dynamic';

/**
 * POST /api/create-offer-checkout
 * Creates a Stripe Checkout session for the $1,647 trial offer.
 * No auth required — this is a prospect-facing payment page.
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

const getStripe = () => new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_placeholder', {
  apiVersion: '2026-03-25.dahlia',
});

// Always use production URL for Stripe callbacks — never localhost
const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL?.startsWith('http://localhost')
    ? 'https://pontifexindustries.com'
    : process.env.NEXT_PUBLIC_APP_URL || 'https://pontifexindustries.com';

export async function POST(request: NextRequest) {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      console.error('STRIPE_SECRET_KEY is not configured');
      return NextResponse.json(
        { error: 'Payment system not configured. Please contact Andres directly.' },
        { status: 500 }
      );
    }

    // Optional: accept email from body for pre-filling checkout
    let customerEmail: string | undefined;
    try {
      const body = await request.json();
      if (body?.email && typeof body.email === 'string') {
        customerEmail = body.email;
      }
    } catch {
      // No body or invalid JSON — that's fine
    }

    const session = await getStripe().checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: 164700, // $1,647.00 in cents
            product_data: {
              name: 'Pontifex Operations Platform — 30-Day Trial',
              description:
                'Full platform access for 30 days. Schedule board, payroll automation, job tracking, GPS, NFC time clocks, and more. 100% refundable if not satisfied.',
              images: [],
            },
          },
          quantity: 1,
        },
      ],
      customer_email: customerEmail,
      success_url: `${APP_URL}/offer/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/offer`,
      metadata: {
        type: 'trial_offer',
        client: 'patriot_concrete_cutting',
        amount_usd: '1647',
      },
      payment_intent_data: {
        description: 'Pontifex Industries — 30-Day Trial for Patriot Concrete Cutting',
        metadata: {
          type: 'trial_offer',
          client: 'patriot_concrete_cutting',
        },
      },
      allow_promotion_codes: false,
      billing_address_collection: 'auto',
      phone_number_collection: {
        enabled: true,
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: { url: session.url },
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error('Stripe checkout error:', error);
    const message =
      error instanceof Stripe.errors.StripeError
        ? error.message
        : 'Failed to create checkout session';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
