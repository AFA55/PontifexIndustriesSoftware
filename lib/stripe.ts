import Stripe from 'stripe';

// Lazy singleton — only instantiated on first call, never at module load.
// This prevents build-time crashes when STRIPE_SECRET_KEY isn't set yet.
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key || key.startsWith('sk_test_REPLACE')) {
      throw new Error('STRIPE_SECRET_KEY is not configured. Add it to your environment variables.');
    }
    _stripe = new Stripe(key, {
      apiVersion: '2026-03-25.dahlia',
      typescript: true,
    });
  }
  return _stripe;
}

// Convenience alias for existing imports
export const stripe = { get: getStripe };
